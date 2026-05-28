import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'
import type { Commit } from '@shared/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { DateTimeCell } from '@/components/cells/DateTimeCell'
import { parseIso } from '@/lib/datetime'

export interface EnrichedCommit extends Commit {
  effectiveDate: string
  isEdited: boolean
}

export function CommitTable({
  rows,
  onEdit,
  onRevert
}: {
  rows: EnrichedCommit[]
  onEdit: (sha: string, iso: string) => void
  onRevert: (sha: string) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'effectiveDate', desc: true }])

  const columns = useMemo<ColumnDef<EnrichedCommit>[]>(
    () => [
      {
        accessorKey: 'shortSha',
        header: 'Commit',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.shortSha}</span>
        )
      },
      {
        accessorKey: 'effectiveDate',
        sortingFn: (a, b) =>
          parseIso(a.original.effectiveDate).getTime() - parseIso(b.original.effectiveDate).getTime(),
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 gap-1"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date &amp; time
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <DateTimeCell
            iso={row.original.effectiveDate}
            isEdited={row.original.isEdited}
            onChange={(iso) => onEdit(row.original.sha, iso)}
            onRevert={() => onRevert(row.original.sha)}
          />
        )
      },
      {
        accessorKey: 'authorName',
        header: 'Author',
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className="block max-w-[160px] truncate text-sm"
            title={`${row.original.authorName} <${row.original.authorEmail}>`}
          >
            {row.original.authorName}
          </span>
        )
      },
      {
        accessorKey: 'subject',
        header: 'Message',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block truncate text-sm" title={row.original.subject}>
            {row.original.subject}
          </span>
        )
      }
    ],
    [onEdit, onRevert]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  })

  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((h) => (
              <TableHead key={h.id} className={h.column.id === 'subject' ? 'w-full' : undefined}>
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
              No commits match the current filter.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={row.original.isEdited ? 'bg-amber-500/[0.06]' : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
