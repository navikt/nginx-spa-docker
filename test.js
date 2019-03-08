const assert = require('assert');
const url = require('url');
require('dotenv').config();
const request = require('request-promise-native');
/**
 * Some configuration
 */
const baseUrl = 'http://localhost:' + process.env.APP_PORT;
const appUrl = baseUrl + process.env.APP_PATH_PREFIX;
const itsAliveUrl = appUrl + '/health/is-alive';
const assetUrl = appUrl + '/logo.svg';
const dummyProtectedRoute = appUrl + '/dummy';

const proxyBehindProtectionUrl = baseUrl +
    '/some-prefix-for-proxy-behind-protection/dummy';
const proxyWithoutProtection = baseUrl +
    '/some-prefix-for-proxy-without-protection/dummy';

describe('Basic testing uten innlogging', function() {

  const testAgent = request.defaults({
    timeout: 1000,
    resolveWithFullResponse: true,
    followRedirect: false,
    simple: false,
  });

  it('its-alive ruten skal fungere uten innlogging', async () => {
    const response = await testAgent.get(itsAliveUrl);
    assert.strictEqual(response.statusCode, 200);
  });

  it('forsiden skal redirecte til APP_PATH_PREFIX', async () => {
    const response = await testAgent.get(baseUrl);
    assert.strictEqual(response.statusCode, 301);
    assert.ok(
        response.headers.location.startsWith(process.env.APP_PATH_PREFIX));
  });

  it('en route skal redirecte til openidc', async () => {
    const response = await testAgent.get(dummyProtectedRoute);
    assert.strictEqual(response.statusCode, 302);
    assert.ok(response.headers['set-cookie'][0].startsWith('session='));
    const parsedURL = url.parse(response.headers.location, true);
    assert.strictEqual(parsedURL.query.client_id, process.env.OIDC_AGENTNAME);
  });

  it('statiske ressurser skal fungere uten innlogging', async () => {
    const response = await testAgent.get(assetUrl);
    assert.strictEqual(response.statusCode, 200);
  });

  it('statiske bilder skal caches', async () => {
    const response = await testAgent.get(assetUrl);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['cache-control'],
        'max-age=31536000, public');
  });
  it('innhold bak proxy skal komme igjennom', async () => {
    const parsedURL = url.parse(proxyWithoutProtection, true);
    const response = await testAgent.get(proxyWithoutProtection);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.path, parsedURL.path);
  });
});

describe('Innlogging', function() {
  let loginResp;
  const cookieJar = request.jar();
  const testAgent = request.defaults({
    timeout: 1000,
    jar: cookieJar,
    resolveWithFullResponse: true,
    followAllRedirects: true,
    simple: false,
  });
  before(async function() {
    const startResp = await testAgent.get(dummyProtectedRoute);
    const loginPageUrl = startResp.request.uri.href + '/login';
    loginResp = await testAgent.post(loginPageUrl, {
      form: {
        email: 'sim@qlik.example',
        password: 'Password1!',
        submit: true,
      },
    });
  });

  it('innlogging skal fungere', async () => {
    /**
     * Skal gi 200 på ruten
     */
    assert.strictEqual(loginResp.statusCode, 200);
    /**
     * Skal redirecte tilbake til orginal route
     */
    assert.strictEqual(loginResp.request.uri.href, dummyProtectedRoute);
    /**
     * Skal sette ID-token (og refreshtoken?)
     */
    assert.ok(loginResp.headers['set-cookie'][0]);
    assert.ok(loginResp.headers['set-cookie'][0].startsWith('ID_token='));
    // console.log('request.headers:', loginResp.request.headers);
    // console.log('response.headers:', loginResp.headers);
  });

  it('innhold bak proxy skal komme igjennom med ID_token', async () => {
    const parsedURL = url.parse(proxyBehindProtectionUrl, true);
    const response = await testAgent.get(proxyBehindProtectionUrl);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.path, parsedURL.path);
    assert.ok(body.headers.cookie.startsWith('ID_token='));
  });

});
