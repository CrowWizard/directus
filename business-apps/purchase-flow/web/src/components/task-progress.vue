<template>
	<div class="task-progress" :data-state="state">
		<span>{{ state }}</span>
	</div>
</template>

<script setup lang="ts">
defineProps<{ state: string }>();
</script>
