---
layout: page
aside: false
sidebar: false
title: Examples
---

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vitepress';

// Bar Chart is the default selection — land here, end up on /example/barChart.
onMounted(() => useRouter().go('/example/barChart'));
</script>

<div class="vp-doc" style="padding: 24px;">

Redirecting to the [Bar Chart example](/example/barChart)…

</div>
