<script setup>
defineProps({
  icon: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  href: { type: String, required: true },
  cta: { type: String, default: 'Open' },
})
</script>

<template>
  <a class="cta-card" :href="href" target="_blank" rel="noopener noreferrer">
    <div class="cta-card__icon" v-if="icon">{{ icon }}</div>
    <div class="cta-card__body">
      <div class="cta-card__title">{{ title }}</div>
      <div class="cta-card__desc" v-if="description">{{ description }}</div>
    </div>
    <div class="cta-card__action">{{ cta }} &rarr;</div>
  </a>
</template>

<style scoped>
.cta-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.25s, background-color 0.25s, transform 0.15s;
  background: var(--vp-c-bg);
}

.cta-card:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  transform: translateY(-2px);
}

.cta-card__icon {
  font-size: 1.5rem;
  line-height: 1;
  flex-shrink: 0;
}

.cta-card__body {
  flex: 1;
  min-width: 0;
}

.cta-card__title {
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.3;
}

.cta-card__desc {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-top: 0.2rem;
  line-height: 1.4;
}

.cta-card__action {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
