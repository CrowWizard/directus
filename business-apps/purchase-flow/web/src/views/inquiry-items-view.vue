<template>
	<app-shell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Inquiry Items</p>
				<h2>询价项列表</h2>
			</div>
		</section>
		<p v-if="loading" class="state-card">正在加载询价项...</p>
		<p v-else-if="error" class="state-card error">{{ error }}</p>
		<div v-else class="task-grid">
			<article v-for="item in items" :key="item.id" class="task-card">
				<p class="muted">{{ item.inquiry_no || item.id }}</p>
				<h3>{{ item.product_name || item.inquiry_item_name || '未命名询价项' }}</h3>
				<p>{{ item.brand || '-' }} / {{ item.state }}</p>
				<router-link class="text-link" :to="`/inquiry-items/${item.id}`">查看摘要</router-link>
			</article>
		</div>
	</app-shell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import AppShell from '../components/app-shell.vue';
import { getTasks } from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import type { InquiryItem } from '../types/purchase-flow';

const auth = useAuthStore();
const items = ref<InquiryItem[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
	try {
		items.value = await getTasks(auth.roleScope, auth.currentUser?.id || '');
	} catch (err) {
		error.value = err instanceof Error ? err.message : '询价项加载失败';
	} finally {
		loading.value = false;
	}
});
</script>
