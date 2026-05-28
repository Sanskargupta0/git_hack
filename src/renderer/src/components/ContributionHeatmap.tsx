import React from 'react'
import { ActivityCalendar } from 'react-activity-calendar'
import { useTheme } from 'next-themes'
import type { HeatmapDay } from '@shared/types'

const heatmapTheme = {
  light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
}

export function ContributionHeatmap({
  data,
  selectedDay,
  onSelectDay
}: {
  data: HeatmapDay[]
  selectedDay: string | null
  onSelectDay: (day: string | null) => void
}) {
  const { resolvedTheme } = useTheme()

  if (data.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
        No commits to visualize yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-1">
      <ActivityCalendar
        data={data}
        theme={heatmapTheme}
        colorScheme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        blockSize={12}
        blockMargin={3}
        fontSize={12}
        maxLevel={4}
        showTotalCount={false}
        labels={{ legend: { less: 'Less', more: 'More' } }}
        renderBlock={(block, activity) => {
          const isSelected = selectedDay === activity.date
          return React.cloneElement(
            block,
            {
              onClick: () => onSelectDay(isSelected ? null : activity.date),
              style: { ...block.props.style, cursor: 'pointer' },
              ...(isSelected ? { stroke: 'hsl(var(--foreground))', strokeWidth: 1.5 } : {})
            },
            <title>{`${activity.count} commit${activity.count === 1 ? '' : 's'} on ${activity.date}`}</title>
          )
        }}
      />
    </div>
  )
}
