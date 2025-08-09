<script setup lang="ts">
import { useData, useRoute } from 'vitepress'
import { computed } from 'vue'

const { site } = useData()
const route = useRoute()

// Define which versions should show the legacy warning
const legacyVersions = ['4.x.x']

// Check if current URL starts with any version folder name
const shouldShowWarning = computed(() => {
  const path = route.path
  return legacyVersions.some(version => path.startsWith(`${site.value.base}${version}/`))
})
</script>

<template>
  <div v-if="shouldShowWarning" class="warning custom-block">
    <p class="custom-block-title">WARNING</p>
    <p>You're looking at the old Rest Cache plugin documentation for <strong>Strapi v4</strong>. Documentation for Strapi v5 can be <a :href="`${site.base}guide/`">found here</a>.</p>
  </div>
</template>

<style scoped>
.warning {
  margin-bottom: 2rem;
}
</style>
