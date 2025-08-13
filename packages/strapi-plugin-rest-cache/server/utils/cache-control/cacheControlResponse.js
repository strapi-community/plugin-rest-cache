'use strict';

const { CacheControlHeaderConfig, CacheRouteConfig } = require("../../types");
const { CacheControlResponseMaxAge } = require("../../types/CacheControlResponseHeaderConfig");
const debug = require('debug')('strapi:strapi-plugin-rest-cache');


/**
 * 
 * @param {*} ctx 
 * @param {CacheControlHeaderConfig} cacheControlHeaderConfig 
 * @param {CacheRouteConfig} cacheRouteConfig 
 * @returns 
 */
function setCacheControlHeader(ctx, cacheControlHeaderConfig, cacheRouteConfig) {
    const responseConfig = cacheControlHeaderConfig?.response;
    if (!responseConfig) {
        return;
    }

    const { hitpass, maxAge, keys } = cacheRouteConfig;

    let cacheControlHeader = ctx.response.get('Cache-Control');

    const directivesToSet = new Map();

    const staleWhileRevalidateSeconds = responseConfig.staleWhileRevalidate;
    if (staleWhileRevalidateSeconds) {
        directivesToSet.set("stale-while-revalidate", staleWhileRevalidateSeconds);
    }

    if (maxAge && responseConfig.maxAge == CacheControlResponseMaxAge.CONFIG) {
        directivesToSet.set("max-age", maxAge);
    }
    if (Number.isInteger(responseConfig.maxAge)) {
        directivesToSet.set("max-age", responseConfig.maxAge);
    }

    debug("cacheControlHeader before:" + cacheControlHeader);
    const newCacheControlHeader = setNewCacheControlDirectives(cacheControlHeader, directivesToSet);
    debug("cacheControlHeader after:" + newCacheControlHeader);

    ctx.response.set('Cache-Control', newCacheControlHeader);
}

/**
 * set directive, without overriding existing ones
 */
function setNewCacheControlDirectives(cacheControlHeader, directivesToSet) {

    if (!directivesToSet || directivesToSet.length == 0) {
        return cacheControlHeader;
    }
    if (!cacheControlHeader) {
        cacheControlHeader = "";
    }

    // Split the existing Cache-Control header by commas to get individual directives
    const currentDirectivesArray = cacheControlHeader.split(',').map(d => d.trim()).filter(d => d != "");

    // Create a map to store current directives and their values (if any)
    const currentDirectives = new Map();

    // Parse the existing directives and store them in the map
    currentDirectivesArray.forEach(directive => {
        const [key, value] = directive.split('=').map(part => part.trim());
        currentDirectives.set(key, value || null); // If there's no value, set it to null
    });

    directivesToSet.forEach((value, key) => {
        // Only add the directive if it's not already set
        if (!currentDirectives.has(key)) {
            currentDirectives.set(key, value);
        }
    });

    // Convert the updated map back into a string
    const updatedDirectives = [];
    currentDirectives.forEach((value, key) => {
        if (value !== null) {
            updatedDirectives.push(`${key}=${value}`);
        } else {
            updatedDirectives.push(key);
        }
    });

    return updatedDirectives.join(', ');
}

module.exports = {
    setCacheControlHeader,
};
