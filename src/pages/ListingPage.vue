<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowLeftIcon, FileQuestionIcon } from '@lucide/vue';
import ListingDetail from '../components/ListingDetail.vue';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { listingById } from '../store';

const props = defineProps<{ id: string }>();
const listing = computed(() => listingById.value.get(props.id));
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 px-6 pt-6 pb-16 lg:px-10">
    <Button as-child variant="ghost" size="sm" class="-ml-2 w-fit text-muted-foreground">
      <RouterLink to="/pozice"><ArrowLeftIcon /> Zpět na seznam</RouterLink>
    </Button>
    <ListingDetail v-if="listing" :listing="listing" full />
    <Empty v-else>
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileQuestionIcon /></EmptyMedia>
        <EmptyTitle>Tahle pozice v seznamu není</EmptyTitle>
      </EmptyHeader>
    </Empty>
  </div>
</template>
