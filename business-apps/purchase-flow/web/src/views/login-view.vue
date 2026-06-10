<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { PENDING_ACCEPT_TOKEN_KEY } from '../utils/accept-token';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');

async function submit() {
	await auth.login(email.value, password.value);

	const pendingToken = window.sessionStorage.getItem(PENDING_ACCEPT_TOKEN_KEY);
	const redirect = String(route.query.redirect || (pendingToken ? `/purchase-flow-accept/accept?token=${encodeURIComponent(pendingToken)}` : '/tasks'));

	await router.push(redirect);
}
</script>

<template>
	<main class="login-page">
		<section class="login-card">
			<p class="eyebrow">Purchase Flow</p>
			<h1>采购报价工作台</h1>
			<p class="muted">使用 Directus 账号登录后查看任务、客户、供应商和询价项。</p>

			<form @submit.prevent="submit">
				<label>
					邮箱
					<input v-model="email" name="email" type="email" autocomplete="email" required />
				</label>
				<label>
					密码
					<input v-model="password" name="password" type="password" autocomplete="current-password" required />
				</label>
				<p v-if="auth.error" class="error">{{ auth.error }}</p>
				<button type="submit" :disabled="auth.loading">{{ auth.loading ? '登录中...' : '登录' }}</button>
			</form>
		</section>
	</main>
</template>
