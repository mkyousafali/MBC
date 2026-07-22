import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface TeamUser {
	user_id: string;
	full_name: string;
	username: string;
	employee_code: string;
	job_title: string;
	department: string;
	branch_name: string;
	is_super_admin: boolean;
}

export interface ResourcePermission {
	resource_key: string;
	main_section: string;
	sub_section: string;
	button_name: string;
	icon: string;
	component: string;
	display_order: number;
	can_view: boolean;
	can_add: boolean;
	can_edit: boolean;
	can_delete: boolean;
}

const stored = browser ? localStorage.getItem('mbc_team_user') : null;
const initial: TeamUser | null = stored ? JSON.parse(stored) : null;
// Backfill is_super_admin for old stored sessions
if (initial && initial.is_super_admin === undefined) {
	initial.is_super_admin = initial.job_title === 'Super Admin';
}

const storedPerms = browser ? localStorage.getItem('mbc_permissions') : null;
const initialPerms: ResourcePermission[] = storedPerms ? JSON.parse(storedPerms) : [];

export const teamUser = writable<TeamUser | null>(initial);
export const userPermissions = writable<ResourcePermission[]>(initialPerms);
export const permissionsLoaded = writable<boolean>(storedPerms !== null);

teamUser.subscribe((val) => {
	if (browser) {
		if (val) {
			localStorage.setItem('mbc_team_user', JSON.stringify(val));
		} else {
			localStorage.removeItem('mbc_team_user');
			localStorage.removeItem('mbc_permissions');
		}
	}
});

userPermissions.subscribe((val) => {
	if (browser) {
		localStorage.setItem('mbc_permissions', JSON.stringify(val));
	}
});

export function setTeamUser(data: TeamUser) {
	teamUser.set(data);
}

export function setPermissions(perms: ResourcePermission[]) {
	userPermissions.set(perms);
	permissionsLoaded.set(true);
}

export function clearTeamUser() {
	teamUser.set(null);
	userPermissions.set([]);
	permissionsLoaded.set(false);
}

export function isSuperAdmin(): boolean {
	const u = get(teamUser);
	return u?.is_super_admin === true;
}

export function canView(resourceKey: string): boolean {
	if (isSuperAdmin()) return true;
	const perms = get(userPermissions);
	return perms.some(p => p.resource_key === resourceKey && p.can_view);
}

export function canAdd(resourceKey: string): boolean {
	if (isSuperAdmin()) return true;
	const perms = get(userPermissions);
	return perms.some(p => p.resource_key === resourceKey && p.can_add);
}

export function canEdit(resourceKey: string): boolean {
	if (isSuperAdmin()) return true;
	const perms = get(userPermissions);
	return perms.some(p => p.resource_key === resourceKey && p.can_edit);
}

export function canDelete(resourceKey: string): boolean {
	if (isSuperAdmin()) return true;
	const perms = get(userPermissions);
	return perms.some(p => p.resource_key === resourceKey && p.can_delete);
}

export function getPermission(resourceKey: string): ResourcePermission | undefined {
	if (isSuperAdmin()) {
		return {
			resource_key: resourceKey, main_section: '', sub_section: '', button_name: '',
			icon: '', component: '', display_order: 0,
			can_view: true, can_add: true, can_edit: true, can_delete: true
		};
	}
	return get(userPermissions).find(p => p.resource_key === resourceKey);
}
