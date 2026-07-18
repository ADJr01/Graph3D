<template>
  <div class="api-search">
    <input
      v-model="query"
      type="text"
      class="api-search-input"
      placeholder="Filter the API by name…"
      aria-label="Filter the API by name"
    />

    <p v-if="query && resultCount === 0" class="api-search-empty">No API members match "{{ query }}".</p>

    <template v-for="layer in filteredLayers" :key="layer.key">
      <h2>{{ layer.title }}</h2>
      <ul>
        <li v-for="name in layer.names" :key="name"><a :href="`/api/${name}`">{{ name }}</a></li>
      </ul>
    </template>

    <template v-if="filteredNonClassLinks.length > 0">
      <h2>Namespaces &amp; Functions (see Concepts)</h2>
      <ul>
        <li v-for="entry in filteredNonClassLinks" :key="entry.name"><a :href="entry.link"><code>{{ entry.name }}</code></a></li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
// manifest.json is the same single source of truth site/.vitepress/config.mjs
// reads to build the `/api/` sidebar (CLAUDE.md §1.1 DRY) — written by
// scripts/docs-api.js's writeIndexPage/main alongside this very page, so the
// filterable list here can never drift from what's actually generated.
import manifest from '../../../api/manifest.json';

const { layerOrder, layerTitle, classesByLayer, nonClassLinks } = manifest;

const query = ref('');

const filteredLayers = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return layerOrder
    .map((key) => ({
      key,
      title: layerTitle[key],
      names: (classesByLayer[key] ?? []).filter((name) => name.toLowerCase().includes(needle)),
    }))
    .filter((layer) => layer.names.length > 0);
});

const filteredNonClassLinks = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return Object.entries(nonClassLinks)
    .filter(([name]) => name.toLowerCase().includes(needle))
    .map(([name, link]) => ({ name, link }));
});

const resultCount = computed(
  () => filteredLayers.value.reduce((total, layer) => total + layer.names.length, 0) + filteredNonClassLinks.value.length,
);
</script>

<style scoped>
.api-search-input {
  display: block;
  width: 100%;
  max-width: 320px;
  margin: 1rem 0 1.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}
.api-search-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}
.api-search-empty {
  color: var(--vp-c-text-2);
}
</style>
