import { supabase } from '$lib/supabase';
import { get } from 'svelte/store';
import { teamUser } from '$lib/stores/auth';

export type AuditAction = 'login' | 'logout' | 'view' | 'create' | 'update' | 'delete' | 'status_change' | 'permission_change';

export interface AuditChange {
	field: string;
	from?: any;
	to?: any;
}

export interface AuditLogParams {
	action: AuditAction;
	resourceType: string;
	resourceId?: string;
	resourceLabel?: string;
	changes?: AuditChange[];
	details?: Record<string, any>;
}

export async function writeAuditLog(params: AuditLogParams) {
	const user = get(teamUser);
	const userId = user?.user_id || 'super_admin';
	const userName = user?.full_name || user?.username || 'Super Admin';

	const detailsObj: Record<string, any> = {};
	if (params.changes && params.changes.length > 0) {
		detailsObj.changes = params.changes;
	}
	if (params.details) {
		Object.assign(detailsObj, params.details);
	}

	try {
		await supabase.rpc('rpc_write_audit_log', {
			p_user_id: userId,
			p_user_name: userName,
			p_action: params.action,
			p_resource_type: params.resourceType,
			p_resource_id: params.resourceId || null,
			p_resource_label: params.resourceLabel || null,
			p_details: Object.keys(detailsObj).length > 0 ? detailsObj : null
		});
	} catch {
		// Audit logging should never break the app
	}
}

/**
 * Compare two objects and return an array of changes.
 * Useful for edit operations.
 */
export function diffChanges(before: Record<string, any>, after: Record<string, any>, fields?: string[]): AuditChange[] {
	const keys = fields || [...new Set([...Object.keys(before), ...Object.keys(after)])];
	const changes: AuditChange[] = [];
	for (const key of keys) {
		const oldVal = before[key];
		const newVal = after[key];
		if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
			changes.push({ field: key, from: oldVal, to: newVal });
		}
	}
	return changes;
}
