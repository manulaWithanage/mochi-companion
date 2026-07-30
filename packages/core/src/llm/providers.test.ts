import { describe, expect, it } from 'vitest';
import {
  AZURE_API_VERSION,
  LOCAL_PROVIDERS,
  PROVIDER_IDS,
  isLocalProvider,
  localCompatUrl,
  localModelsUrl,
  normaliseBaseUrl,
  azureChatUrl,
  cleanAzureResourceName,
  detectProvider,
  MIN_TOOL_PARAMS_B,
  packAzureKey,
  parameterCount,
  explainMismatch,
  inferCapabilities,
  looksLikeKey,
  parseModelList,
  PROVIDERS,
  redactKey,
  supports,
  unpackAzureKey,
  type DiscoveredModel,
} from './providers.js';

describe('detectProvider', () => {
  it('identifies each provider from its key prefix', () => {
    expect(detectProvider('sk-ant-api03-abcdefghijklmnop')).toBe('anthropic');
    expect(detectProvider('AIzaSyAbcdefghijklmnopqrstuv')).toBe('google');
    expect(detectProvider('sk-proj-abcdefghijklmnopqrst')).toBe('openai');
  });

  it('tests sk-ant- before sk-', () => {
    // Reversed, every Anthropic key reads as OpenAI and every call 401s.
    expect(detectProvider('sk-ant-anything')).toBe('anthropic');
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(detectProvider('  sk-ant-abc  ')).toBe('anthropic');
  });

  it('returns null for anything unrecognised', () => {
    expect(detectProvider('')).toBeNull();
    expect(detectProvider('   ')).toBeNull();
    expect(detectProvider('hunter2')).toBeNull();
    expect(detectProvider('ghp_githubtokennotanllmkey')).toBeNull();
  });
});

describe('looksLikeKey', () => {
  it('accepts a plausible key', () => {
    expect(looksLikeKey('sk-ant-api03-abcdefghijklmnop')).toBe(true);
  });

  it('rejects obvious malformations before any network round trip', () => {
    expect(looksLikeKey('sk-short')).toBe(false);
    expect(looksLikeKey('sk-ant with a space in it here')).toBe(false);
    expect(looksLikeKey('not-a-key-at-all-but-quite-long')).toBe(false);
  });
});

describe('redactKey', () => {
  it('shows enough to identify a key without exposing it', () => {
    const r = redactKey('sk-ant-api03-SECRETVALUE-1234');
    expect(r).toContain('1234');
    expect(r).not.toContain('SECRETVALUE');
  });

  it('fully masks anything too short to redact safely', () => {
    expect(redactKey('sk-abc')).toBe('••••');
  });
});

describe('inferCapabilities', () => {
  it('always includes text', () => {
    expect(inferCapabilities('openai', 'anything')).toContain('text');
    expect(inferCapabilities('ollama', 'anything')).toContain('text');
  });

  it('withholds tools from small local models', () => {
    // The whole reason tiers exist: a 3B model will hallucinate tool args.
    expect(inferCapabilities('ollama', 'llama3.2:3b')).not.toContain('tools');
    expect(inferCapabilities('ollama', 'phi3:mini')).not.toContain('tools');
  });

  it('grants tools to local families known to handle them', () => {
    expect(inferCapabilities('ollama', 'qwen2.5:14b')).toContain('tools');
    expect(inferCapabilities('ollama', 'command-r:35b')).toContain('tools');
  });

  it('grants tools on family alone when no size is stated', () => {
    expect(inferCapabilities('ollama', 'command-r')).toContain('tools');
  });

  it('detects local vision models', () => {
    expect(inferCapabilities('ollama', 'llava:13b')).toContain('vision');
    expect(inferCapabilities('ollama', 'moondream')).toContain('vision');
  });

  it('withholds tools from embedding and audio models', () => {
    expect(inferCapabilities('openai', 'text-embedding-3-large')).not.toContain('tools');
    expect(inferCapabilities('openai', 'whisper-1')).not.toContain('tools');
  });

  it('assumes hosted chat models handle tools', () => {
    expect(inferCapabilities('anthropic', 'some-future-model-name')).toContain('tools');
  });
});

describe('parameterCount', () => {
  it('reads the size from an Ollama tag', () => {
    expect(parameterCount('llama3.2:3b')).toBe(3);
    expect(parameterCount('qwen2.5:14b')).toBe(14);
    expect(parameterCount('mixtral:8x7b')).toBe(7);
  });

  it('handles fractional sizes', () => {
    expect(parameterCount('tinyllama:1.1b')).toBe(1.1);
  });

  it('returns null when no size is stated', () => {
    expect(parameterCount('command-r')).toBeNull();
    expect(parameterCount('llava')).toBeNull();
  });

  it('sets the tool threshold somewhere defensible', () => {
    expect(MIN_TOOL_PARAMS_B).toBeGreaterThanOrEqual(4);
    expect(MIN_TOOL_PARAMS_B).toBeLessThanOrEqual(14);
  });
});

describe('supports', () => {
  const model = (caps: DiscoveredModel['capabilities']): DiscoveredModel => ({
    id: 'm',
    provider: 'openai',
    capabilities: caps,
  });

  it('passes when everything required is present', () => {
    expect(supports(model(['text', 'tools']), ['text'])).toBe(true);
    expect(supports(model(['text', 'tools']), ['text', 'tools'])).toBe(true);
  });

  it('fails when anything is missing', () => {
    expect(supports(model(['text']), ['text', 'tools'])).toBe(false);
  });

  it('passes trivially for no requirements', () => {
    expect(supports(model(['text']), [])).toBe(true);
  });
});

describe('explainMismatch', () => {
  const weak: DiscoveredModel = { id: 'llama3.2:3b', provider: 'ollama', capabilities: ['text'] };

  it('returns null when the model is adequate', () => {
    expect(explainMismatch(weak, ['text'], 'Chat')).toBeNull();
  });

  it('names the model and the missing capability', () => {
    const msg = explainMismatch(weak, ['text', 'tools'], 'Calendar actions');
    expect(msg).toContain('Calendar actions');
    expect(msg).toContain('tool calling');
    expect(msg).toContain('llama3.2:3b');
  });

  it('lists every missing capability', () => {
    const msg = explainMismatch(weak, ['tools', 'vision'], 'Screen Helper');
    expect(msg).toContain('tool calling');
    expect(msg).toContain('image understanding');
  });
});

describe('parseModelList', () => {
  it('reads the OpenAI/Anthropic shape', () => {
    const models = parseModelList('openai', { data: [{ id: 'model-a' }, { id: 'model-b' }] });
    expect(models.map((m) => m.id)).toEqual(['model-a', 'model-b']);
    expect(models[0]?.provider).toBe('openai');
  });

  it('strips the models/ prefix Google returns', () => {
    const models = parseModelList('google', { models: [{ name: 'models/gemini-x' }] });
    expect(models[0]?.id).toBe('gemini-x');
  });

  it('reads the Ollama shape', () => {
    const models = parseModelList('ollama', { models: [{ name: 'llama3.2:3b' }] });
    expect(models[0]?.id).toBe('llama3.2:3b');
  });

  it('attaches capabilities to each discovered model', () => {
    const models = parseModelList('ollama', { models: [{ name: 'llava:13b' }] });
    expect(models[0]?.capabilities).toContain('vision');
  });

  it('returns empty for junk rather than throwing', () => {
    // Provider responses are untrusted; a bad payload must not crash setup.
    for (const junk of [null, undefined, 'nope', 42, [], {}, { data: 'not-an-array' }]) {
      expect(parseModelList('openai', junk)).toEqual([]);
    }
  });

  it('skips malformed entries but keeps good ones', () => {
    const models = parseModelList('openai', {
      data: [{ id: 'good' }, { notAnId: 1 }, null, { id: '' }],
    });
    expect(models.map((m) => m.id)).toEqual(['good']);
  });
});

describe('PROVIDERS', () => {
  it('gives every key provider a live discovery endpoint', () => {
    // Only `key` providers have a fixed models URL. `local` builds one from
    // the user's base URL, and `endpoint` has none to build — Azure cannot
    // enumerate deployments without ARM management credentials.
    for (const p of Object.values(PROVIDERS)) {
      if (p.kind === 'key') expect(p.modelsUrl).toMatch(/^https?:\/\//);
      else expect(p.modelsUrl).toBe('');
    }
  });

  it('marks exactly the local runtimes as local', () => {
    expect(PROVIDERS.ollama.local).toBe(true);
    expect(PROVIDERS.lmstudio.local).toBe(true);
    expect(PROVIDERS.openai.local).toBe(false);
    expect(PROVIDERS.azure.local).toBe(false);
  });

  it('keeps `local` and `kind` in agreement', () => {
    // Two fields encoding one fact, so a mismatch would route a keyed provider
    // through the no-key path or vice versa.
    for (const p of Object.values(PROVIDERS)) {
      expect(p.local).toBe(p.kind === 'local');
    }
  });

  it('hardcodes no model ids anywhere', () => {
    // The rule this file exists to enforce.
    const serialized = JSON.stringify(PROVIDERS);
    expect(serialized).not.toMatch(/gpt-|claude-\d|gemini-\d|llama\d/);
  });
});

describe('cleanAzureResourceName', () => {
  it('accepts a bare resource name unchanged', () => {
    expect(cleanAzureResourceName('my-resource')).toBe('my-resource');
  });

  it('extracts the resource from every hostname the portal shows', () => {
    // The portal shows different hostnames for the same resource depending on
    // where you look, and people paste whichever one they found.
    expect(cleanAzureResourceName('my-resource.openai.azure.com')).toBe('my-resource');
    expect(cleanAzureResourceName('my-resource.cognitiveservices.azure.com')).toBe('my-resource');
    expect(cleanAzureResourceName('https://my-resource.openai.azure.com/')).toBe('my-resource');
  });

  it('extracts the resource from a full deployment URL', () => {
    expect(
      cleanAzureResourceName(
        'https://my-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-01',
      ),
    ).toBe('my-resource');
  });

  it('tolerates whitespace from a paste', () => {
    expect(cleanAzureResourceName('  my-resource  ')).toBe('my-resource');
  });
});

describe('azureChatUrl', () => {
  it('builds the deployment-based chat-completions URL', () => {
    // This must stay byte-identical to what
    // createAzure({ resourceName, apiVersion, useDeploymentBasedUrls: true })
    //   .chat(deployment)
    // produces. When validation and generation built different URLs, a key
    // validated successfully and then failed on every real call.
    expect(azureChatUrl('res', 'dep')).toBe(
      `https://res.openai.azure.com/openai/deployments/dep/chat/completions?api-version=${AZURE_API_VERSION}`,
    );
  });

  it('pins a GA api-version rather than a preview one', () => {
    // Azure rejects unknown api-versions outright, so this must be a value
    // every resource accepts.
    expect(AZURE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('packAzureKey / unpackAzureKey', () => {
  const credentials = { resource: 'my-res', deployment: 'gpt-4o-prod', apiKey: 'a'.repeat(32) };

  it('round-trips', () => {
    expect(unpackAzureKey(packAzureKey(credentials))).toEqual(credentials);
  });

  it('keeps the parts in the documented order', () => {
    // The prefix makes the parts 1-indexed, which is what got miscounted when
    // each call site split the string by hand.
    expect(packAzureKey(credentials)).toBe(`azure::my-res::gpt-4o-prod::${'a'.repeat(32)}`);
  });

  it('rejects anything that is not a packed Azure key', () => {
    expect(unpackAzureKey('sk-proj-abcdef')).toBeNull();
    expect(unpackAzureKey('azure::only-two::parts')).toBeNull();
    expect(unpackAzureKey('azure::res::dep::key::extra')).toBeNull();
  });

  it('rejects a packed key with an empty part', () => {
    // An empty resource would build https://.openai.azure.com and fail with a
    // DNS error that says nothing about the real cause.
    expect(unpackAzureKey('azure::::dep::key')).toBeNull();
    expect(unpackAzureKey('azure::res::::key')).toBeNull();
    expect(unpackAzureKey('azure::res::dep::')).toBeNull();
  });
});

describe('provider descriptors', () => {
  it('gives every provider a kind, so nothing is configured by special case', () => {
    for (const id of PROVIDER_IDS) {
      expect(['key', 'local', 'endpoint']).toContain(PROVIDERS[id].kind);
    }
  });

  it('lists both local runtimes', () => {
    expect(LOCAL_PROVIDERS.map((p) => p.id)).toEqual(['ollama', 'lmstudio']);
  });

  it('gives every local runtime the paths a probe and a call both need', () => {
    // A local provider missing either path silently falls back to a guess, and
    // the guess is only wrong for one of the two runtimes.
    for (const info of LOCAL_PROVIDERS) {
      expect(info.defaultBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(info.modelsPath).toBeDefined();
      expect(info.compatPath).toBeDefined();
    }
  });

  it('puts the two local runtimes on different ports', () => {
    const ports = LOCAL_PROVIDERS.map((p) => p.defaultBaseUrl);
    expect(new Set(ports).size).toBe(LOCAL_PROVIDERS.length);
  });

  it('reads list shape from the descriptor, not the provider id', () => {
    // The whole reason listShape exists: both are local, and they disagree.
    expect(PROVIDERS.ollama.listShape).toBe('ollama');
    expect(PROVIDERS.lmstudio.listShape).toBe('openai');
  });

  it('treats exactly the local runtimes as local', () => {
    expect(isLocalProvider('ollama')).toBe(true);
    expect(isLocalProvider('lmstudio')).toBe(true);
    for (const id of ['openai', 'anthropic', 'google', 'azure'] as const) {
      expect(isLocalProvider(id)).toBe(false);
    }
  });
});

describe('normaliseBaseUrl', () => {
  it('strips a trailing /v1', () => {
    // LM Studio's own UI shows http://localhost:1234/v1, so that is what gets
    // pasted. Keeping it would request /v1/v1/models and 404.
    expect(normaliseBaseUrl('http://localhost:1234/v1')).toBe('http://localhost:1234');
    expect(normaliseBaseUrl('http://localhost:1234/v1/')).toBe('http://localhost:1234');
  });

  it('adds a scheme when the user typed a bare host', () => {
    expect(normaliseBaseUrl('localhost:1234')).toBe('http://localhost:1234');
    expect(normaliseBaseUrl('192.168.1.5:1234')).toBe('http://192.168.1.5:1234');
  });

  it('keeps https when given', () => {
    expect(normaliseBaseUrl('https://box.lan:1234')).toBe('https://box.lan:1234');
  });

  it('strips trailing slashes', () => {
    expect(normaliseBaseUrl('http://localhost:1234///')).toBe('http://localhost:1234');
  });

  it('returns empty for empty, meaning "use the default"', () => {
    expect(normaliseBaseUrl('')).toBe('');
    expect(normaliseBaseUrl('   ')).toBe('');
  });
});

describe('localModelsUrl / localCompatUrl', () => {
  it('uses each runtime’s own discovery path', () => {
    expect(localModelsUrl('ollama')).toBe('http://127.0.0.1:11434/api/tags');
    expect(localModelsUrl('lmstudio')).toBe('http://127.0.0.1:1234/v1/models');
  });

  it('sends both runtimes’ chat calls to the OpenAI-compatible root', () => {
    expect(localCompatUrl('ollama')).toBe('http://127.0.0.1:11434/v1');
    expect(localCompatUrl('lmstudio')).toBe('http://127.0.0.1:1234/v1');
  });

  it('honours an override, normalising it first', () => {
    expect(localModelsUrl('lmstudio', 'http://localhost:4321/v1')).toBe(
      'http://localhost:4321/v1/models',
    );
    expect(localCompatUrl('lmstudio', 'localhost:4321')).toBe('http://localhost:4321/v1');
  });

  it('falls back to the default when the override is blank', () => {
    expect(localModelsUrl('lmstudio', '')).toBe('http://127.0.0.1:1234/v1/models');
  });
});

describe('parseModelList for LM Studio', () => {
  it('reads OpenAI’s shape even though the provider is local', () => {
    const models = parseModelList('lmstudio', {
      data: [{ id: 'qwen2.5-7b-instruct' }, { id: 'llama-3.2-1b-instruct' }],
    });
    expect(models.map((m) => m.id)).toEqual(['qwen2.5-7b-instruct', 'llama-3.2-1b-instruct']);
    expect(models[0]?.provider).toBe('lmstudio');
  });

  it('applies the small-local-model caution to LM Studio too', () => {
    // Same conservatism as Ollama: a 1B model must not be handed tool calling
    // just because it is served over an OpenAI-compatible endpoint.
    const small = parseModelList('lmstudio', { data: [{ id: 'llama-3.2-1b-instruct' }] });
    expect(small[0]?.capabilities).not.toContain('tools');

    const big = parseModelList('lmstudio', { data: [{ id: 'llama-3.1-8b-instruct' }] });
    expect(big[0]?.capabilities).toContain('tools');
  });

  it('handles the hyphenated naming LM Studio uses', () => {
    // Ollama tags it llama3.1:8b, LM Studio llama-3.1-8b — the family regex has
    // to match both or tool calling is silently withheld from LM Studio.
    expect(inferCapabilities('lmstudio', 'llama-3.1-8b-instruct')).toContain('tools');
    expect(inferCapabilities('ollama', 'llama3.1:8b')).toContain('tools');
  });
});
