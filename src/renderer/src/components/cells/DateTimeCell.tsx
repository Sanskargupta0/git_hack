import { useState } from 'react'
import { CalendarDays, Clock, RotateCcw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { combineDayAndTime, displayDateTime, parseIso, timeInputValue, toLocalIso } from '@/lib/datetime'

export function DateTimeCell({
  iso,
  isEdited,
  onChange,
  onRevert
}: {
  iso: string
  isEdited: boolean
  onChange: (iso: string) => void
  onRevert: () => void
}) {
  const [open, setOpen] = useState(false)
  const date = parseIso(iso)
  const time = timeInputValue(date)

  function handleDay(day: Date | undefined) {
    if (!day) return
    onChange(toLocalIso(combineDayAndTime(day, time)))
  }

  function handleTime(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (!v) return
    const normalized = v.length === 5 ? `${v}:00` : v // HH:mm -> HH:mm:ss
    onChange(toLocalIso(combineDayAndTime(date, normalized)))
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 justify-start gap-2 font-normal tabular-nums',
              isEdited && 'font-medium text-amber-600 dark:text-amber-400'
            )}
          >
            <CalendarDays className="h-3.5 w-3.5 opacity-60" />
            {displayDateTime(iso)}
            {isEdited && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={handleDay} defaultMonth={date} initialFocus />
          <div className="flex items-center gap-2 border-t p-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="time"
              step={1}
              value={time}
              onChange={handleTime}
              className="h-8 w-[130px] tabular-nums"
            />
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {isEdited && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Revert to original date"
          onClick={onRevert}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
