const { CacheContentTypeConfig } = require("./CacheContentTypeConfig");

const CacheControlResponseMaxAge = Object.freeze({
    /**
     * Do not include maxAge in response Cache-Control
     */
    NONE: "NONE",
    /**
     * Include maxAge in response Cache-Control - set it to maxAge configured in Strategy
     */
    CONFIG: "CONFIG",
});

class CacheControlResponseHeaderConfig {
    /**
     * stale-while-revalidate
     * see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#response_directives
     * @type {number | boolean}
     */
    staleWhileRevalidate = false;
    
    /**
     * @type {CacheControlResponseMaxAge | number}
     */
    maxAge = CacheControlResponseMaxAge.NONE;

    constructor(options = {}) {
        const {
            staleWhileRevalidate = false,
            maxAge = CacheControlResponseMaxAge.NONE,
        } = options;

        this.staleWhileRevalidate = staleWhileRevalidate;
        this.maxAge = maxAge;
    }
}

module.exports = {
    CacheControlResponseHeaderConfig,
    CacheControlResponseMaxAge,
}
