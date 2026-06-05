import { createRouter, createWebHistory } from 'vue-router';

import { useAuthStore } from './stores/auth';
import LoginView from './views/login-view.vue';
import TasksView from './views/tasks-view.vue';

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/tasks' },
		{ path: '/login', component: LoginView, meta: { public: true } },
		{ path: '/tasks', component: TasksView },
	],
});

router.beforeEach((to) => {
	const auth = useAuthStore();

	if (!to.meta.public && !auth.isAuthenticated) return '/login';
	if (to.path === '/login' && auth.isAuthenticated) return '/tasks';

	return true;
});
