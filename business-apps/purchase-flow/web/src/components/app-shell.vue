<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const signingOut = ref(false);

async function signOut() {
	if (signingOut.value) return;

	signingOut.value = true;

	try {
		await auth.logout();
	} finally {
		await router.push('/login');
		signingOut.value = false;
	}
}
</script>

<template>
	<div class="app-shell">
		<a class="skip-link" href="#main">跳到主内容</a>
		<aside class="sidebar">
			<div>
				<p class="eyebrow">Purchase Flow</p>
				<h1>采购报价</h1>
				<p class="sidebar-subtitle">从询价、比价到供应商协作的采购工作台。</p>
			</div>
			<nav aria-label="主导航">
				<RouterLink to="/tasks">我的任务</RouterLink>
				<RouterLink to="/customers">客户管理</RouterLink>
				<RouterLink to="/suppliers">供应商管理</RouterLink>
				<RouterLink to="/inquiry-items">询价项</RouterLink>
			</nav>
		</aside>
		<main id="main" class="content-panel" tabindex="-1">
			<header class="topbar">
				<div>
					<p class="topbar-label">当前用户</p>
					<strong>{{ auth.userName }}</strong>
				</div>
				<button type="button" class="ghost-button" :disabled="signingOut" @click="signOut">
					{{ signingOut ? '退出中...' : '退出登录' }}
				</button>
			</header>
			<slot />
		</main>
	</div>
</template>
