<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function signOut() {
	await auth.logout();
	await router.push('/login');
}
</script>

<template>
	<div class="app-shell">
		<aside class="sidebar">
			<div>
				<p class="eyebrow">Purchase Flow</p>
				<h1>采购报价</h1>
			</div>
			<nav>
				<RouterLink to="/tasks">我的任务</RouterLink>
				<RouterLink to="/customers">客户管理</RouterLink>
				<RouterLink to="/suppliers">供应商管理</RouterLink>
				<RouterLink to="/inquiry-items">询价项</RouterLink>
			</nav>
		</aside>
		<main class="content-panel">
			<header class="topbar">
				<div>
					<p class="muted">当前用户</p>
					<strong>{{ auth.userName }}</strong>
				</div>
				<button type="button" class="ghost-button" @click="signOut">退出</button>
			</header>
			<slot />
		</main>
	</div>
</template>
