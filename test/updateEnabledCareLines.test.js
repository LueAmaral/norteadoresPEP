const assert = require('node:assert');
const { test } = require('node:test');

function createChromeStub() {
  return {
    tabs: { onRemoved: { addListener: () => {} }, query: () => {}, update: () => {} },
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      getURL: () => 'options.html',
      lastError: null,
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      session: { get: () => {}, set: () => {} },
    },
    alarms: { onAlarm: { addListener: () => {} }, create: () => {} },
    action: { onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    windows: { update: () => {} },
  };
}

global.chrome = createChromeStub();
const { updateEnabledCareLinesOnSnippetsChange, ENABLED_CARE_LINES_KEY } = require('../background.js');

function createMockChrome(initialStore = {}) {
  const store = { ...initialStore };
  const setCalls = [];
  const chrome = createChromeStub();
  chrome.storage.local.get = async (key) => {
    if (Array.isArray(key)) {
      const result = {};
      key.forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(store, k)) {
          result[k] = store[k];
        }
      });
      return result;
    }
    return { [key]: store[key] };
  };
  chrome.storage.local.set = async (obj) => {
    Object.assign(store, obj);
    setCalls.push(obj);
  };
  chrome._getStore = () => store;
  chrome._getSetCalls = () => setCalls;
  return chrome;
}

const snippetsSample = {
  medico: {
    LinhaA: {},
    LinhaB: {},
  },
  enfermeiro: {
    LinhaC: {},
  },
};

test('missing key initializes all care lines', async () => {
  const chromeMock = createMockChrome({});
  global.chrome = chromeMock;
  await updateEnabledCareLinesOnSnippetsChange(snippetsSample, false);
  assert.deepStrictEqual(chromeMock._getStore()[ENABLED_CARE_LINES_KEY], {
    medico: ['LinhaA', 'LinhaB'],
    enfermeiro: ['LinhaC'],
  });
});

test('array value is reset and all lines enabled', async () => {
  const chromeMock = createMockChrome({ [ENABLED_CARE_LINES_KEY]: [] });
  global.chrome = chromeMock;
  await updateEnabledCareLinesOnSnippetsChange(snippetsSample, false);
  assert.deepStrictEqual(chromeMock._getStore()[ENABLED_CARE_LINES_KEY], {
    medico: ['LinhaA', 'LinhaB'],
    enfermeiro: ['LinhaC'],
  });
});

test('valid object prunes and keeps existing selections', async () => {
  const chromeMock = createMockChrome({
    [ENABLED_CARE_LINES_KEY]: {
      medico: ['LinhaA'],
      nutricionista: ['LinhaX'],
    },
  });
  global.chrome = chromeMock;
  await updateEnabledCareLinesOnSnippetsChange(snippetsSample, false);
  assert.deepStrictEqual(chromeMock._getStore()[ENABLED_CARE_LINES_KEY], {
    medico: ['LinhaA'],
    enfermeiro: ['LinhaC'],
  });
});
