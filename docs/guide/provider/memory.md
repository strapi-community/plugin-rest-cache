---
title: Memory provider
---

# Memory provider

The memory provider allow you to store cached content in memory. It use a simple key-value store with LRU algorithm provided by [`quick-lru`](https://github.com/sindresorhus/quick-lru).

## Installation

::: info
This provider is already installed with the plugin.
:::

## Configuration

```js {6-16}
// file: /config/plugins.js

module.exports = ({ env }) => ({
  'rest-cache': {
    config: {
      provider: {
        name: 'memory',
        getTimeout: 500,
        options: {
          // The time to live in milliseconds. This is the maximum amount of time that an item can be in the cache before it is removed.
          ttl: 3600 * 1000
          // ...
        },
      },
      strategy: {
        // ...
      },
    },
  },
});
```

::: tip
Additionally you can add options specifically for this provider. For all the options see [`quick-lru`](https://github.com/sindresorhus/quick-lru/tree/v7.0.1#options) documentation.
:::
