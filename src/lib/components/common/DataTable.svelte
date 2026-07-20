<script lang="ts">
	let { columns, rows, searchable = false }: {
		columns: { key: string; label: string }[];
		rows: Record<string, any>[];
		searchable?: boolean;
	} = $props();

	let search = $state('');
	const filteredRows = $derived(
		search
			? rows.filter(row =>
				Object.values(row).some(v =>
					String(v).toLowerCase().includes(search.toLowerCase())
				)
			)
			: rows
	);
</script>

<div class="data-table-wrapper">
	{#if searchable}
		<div class="table-toolbar">
			<input
				type="text"
				placeholder="Search..."
				bind:value={search}
				class="table-search"
			/>
		</div>
	{/if}
	<div class="table-container">
		<table>
			<thead>
				<tr>
					{#each columns as col}
						<th>{col.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each filteredRows as row}
					<tr>
						{#each columns as col}
							<td>{row[col.key] ?? '—'}</td>
						{/each}
					</tr>
				{:else}
					<tr>
						<td colspan={columns.length} class="empty-cell">No data found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.data-table-wrapper {
		background: var(--color-white);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.table-toolbar {
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border-light);
	}
	.table-search {
		padding: var(--space-2) var(--space-4);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		width: 100%;
		max-width: 300px;
	}
	.table-search:focus {
		outline: none;
		border-color: var(--color-primary);
	}
	.table-container { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; }
	th {
		text-align: left;
		padding: var(--space-3) var(--space-4);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		background: var(--color-bg);
		white-space: nowrap;
		border-bottom: 1px solid var(--color-border-light);
	}
	td {
		padding: var(--space-3) var(--space-4);
		font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-border-light);
		white-space: nowrap;
	}
	tr:hover td { background: var(--color-surface-hover); }
	.empty-cell {
		text-align: center;
		padding: var(--space-8);
		color: var(--color-text-light);
	}
</style>
