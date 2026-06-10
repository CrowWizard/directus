<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { DIRECTUS_URL } from '../api/http';
import { acceptAssignment, type ApiErrorDetail } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import { useAuthStore } from '../stores/auth';
import { PENDING_ACCEPT_TOKEN_KEY } from '../utils/accept-token';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const loading = ref(true);
const error = ref('');
const requestUrl = ref('');

const requestController = new AbortController();

onMounted(async () => {
	const token = String(route.query.token || window.sessionStorage.getItem(PENDING_ACCEPT_TOKEN_KEY) || '');

	if (!token) {
		error.value = '缺少接单 Token。';
		loading.value = false;
		return;
	}

	window.sessionStorage.setItem(PENDING_ACCEPT_TOKEN_KEY, token);

	if (!auth.isAuthenticated) {
		loading.value = false;
		await router.replace({ path: '/login', query: { redirect: `/purchase-flow-accept/accept?token=${encodeURIComponent(token)}` } });
		return;
	}

	requestUrl.value = `${DIRECTUS_URL}/purchase-flow-accept/accept-json?token=${token}`;

	try {
		const result = await acceptAssignment(token, requestController.signal);
		window.sessionStorage.removeItem(PENDING_ACCEPT_TOKEN_KEY);
		await router.replace(`/inquiry-items/${result.inquiry_item_id}/detail`);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = getAcceptErrorMessage(err);
	} finally {
		loading.value = false;
	}
});

function getAcceptErrorMessage(errorValue: unknown) {
	const apiError = errorValue as ApiErrorDetail;
	const message = apiError.message || '';
	const code = apiError.code || '';
	const evidence = `${code} ${message}`;

	if (apiError.status === 403 || /forbidden|permission|not.*buyer|assigned/i.test(evidence)) {
		return '接单失败：不是被分配采购员、token 已过期，或任务已重新分配。';
	}

	if (/expired|token/i.test(evidence)) return '接单失败：token 已过期或无效。';

	return message || '接单失败，请确认链接是否有效。';
}

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Accept</p>
				<h2>采购接单</h2>
			</div>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在校验接单链接...</p>
		<section v-else-if="error" class="state-card error" role="status" aria-live="polite">
			<p>{{ error }}</p>
			<p class="muted">请求地址：{{ requestUrl }}</p>
			<p class="muted">请确认前端编译时 VITE_DIRECTUS_URL 指向 Directus 后端，并且后端已安装新版 accept Endpoint。</p>
			<RouterLink class="text-link" to="/tasks">返回我的任务</RouterLink>
		</section>
		<section v-else class="state-card" role="status" aria-live="polite">
			<p>已保存接单 token，登录后会继续接单。</p>
		</section>
	</AppShell>
</template>
