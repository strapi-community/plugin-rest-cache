<script setup>
import DefaultTheme from 'vitepress/theme'
import LegacyWarning from '../components/LegacyWarning.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <LegacyWarning />
    </template>
  </Layout>
</template>

<style scoped>
</style>
