<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { deck, shortlist } from '../store';

// The app is a flow: sort what is new, then contact the shortlist, then follow up.
// Opening it lands on the first step that has something waiting.
const router = useRouter();
onMounted(() => {
  const waiting = deck.value.cards.length + deck.value.waiting;
  void router.replace(waiting ? '/tridit' : shortlist.value.length ? '/vyber' : '/dnes');
});
</script>

<template><div /></template>
