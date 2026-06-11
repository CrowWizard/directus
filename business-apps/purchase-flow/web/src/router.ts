import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import AcceptAssignmentView from './views/accept-assignment-view.vue';
import BuyerProfilesView from './views/buyer-profiles-view.vue';
import CustomerCreateView from './views/customer-create-view.vue';
import CustomerEditView from './views/customer-edit-view.vue';
import CustomersView from './views/customers-view.vue';
import EmployeesView from './views/employees-view.vue';
import InquiryItemDetailView from './views/inquiry-item-detail-view.vue';
import InquiryItemSummaryView from './views/inquiry-item-summary-view.vue';
import InquiryItemsView from './views/inquiry-items-view.vue';
import LoginView from './views/login-view.vue';
import SupplierCreateView from './views/supplier-create-view.vue';
import SupplierEditView from './views/supplier-edit-view.vue';
import SuppliersView from './views/suppliers-view.vue';
import TagsView from './views/tags-view.vue';
import TasksView from './views/tasks-view.vue';

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/tasks' },
		{ path: '/login', component: LoginView, meta: { public: true } },
		{ path: '/purchase-flow-accept/accept', component: AcceptAssignmentView },
		{ path: '/buyer-profiles', component: BuyerProfilesView, meta: { requiresManager: true } },
		{ path: '/customers', component: CustomersView },
		{ path: '/customers/new', component: CustomerCreateView, meta: { requiresManager: true } },
		{ path: '/customers/:id/edit', component: CustomerEditView, meta: { requiresManager: true } },
		{ path: '/employees', component: EmployeesView, meta: { requiresManager: true } },
		{ path: '/inquiry-items', component: InquiryItemsView },
		{ path: '/inquiry-items/:id', component: InquiryItemSummaryView },
		{ path: '/inquiry-items/:id/detail', component: InquiryItemDetailView },
		{ path: '/suppliers', component: SuppliersView },
		{ path: '/suppliers/new', component: SupplierCreateView, meta: { requiresManager: true } },
		{ path: '/suppliers/:id/edit', component: SupplierEditView, meta: { requiresManager: true } },
		{ path: '/tags', component: TagsView, meta: { requiresManager: true } },
		{ path: '/tasks', component: TasksView },
	],
});

router.beforeEach(async (to) => {
	const auth = useAuthStore();

	if (!to.meta.public && !auth.isAuthenticated) {
		return { path: '/login', query: { redirect: to.fullPath } };
	}

	if (!to.meta.public && !(await auth.ensureCurrentUser())) {
		return { path: '/login', query: { redirect: to.fullPath } };
	}

	if (to.path === '/login' && auth.isAuthenticated) return '/tasks';

	if (to.meta.requiresManager && auth.roleScope !== 'Manager') return '/tasks';

	return true;
});
