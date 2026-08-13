import { CacheKeysConfig } from './CacheKeysConfig';
import { ms } from './common';
import type {
  CachePluginHitpass,
  ConfiguredRoutePath,
  HttpMethod,
  Milliseconds,
} from './common';
import type { CacheRouteConfigInput } from './inputs';

export class CacheRouteConfig {
  /** Milliseconds. See the Milliseconds brand for why this is not a bare number. */
  maxAge: Milliseconds = ms(3600000);

  path: ConfiguredRoutePath;

  method: HttpMethod = 'GET';

  paramNames: string[] = [];

  keys: CacheKeysConfig;

  hitpass: CachePluginHitpass | boolean = false;

  constructor(options: CacheRouteConfigInput = {}) {
    const {
      path,
      method = 'GET',
      paramNames = [],
      maxAge = 3600000,
      hitpass = false,
      keys = new CacheKeysConfig(),
    } = options;

    this.path = (path ?? '') as ConfiguredRoutePath;
    this.method = method;
    this.paramNames = paramNames;
    this.maxAge = ms(maxAge);
    this.hitpass = hitpass;
    this.keys = keys instanceof CacheKeysConfig ? keys : new CacheKeysConfig(keys);
  }
}
