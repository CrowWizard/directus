<script setup lang="ts">
defineProps<{ state: string }>();
</script>

<template>
	<div class="task-progress" :data-state="state">
		<span>{{ state }}</span>
	</div>
</template>
