// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react'
import { getCalendars, getSubscriptions } from '../api/client'
import type { CalendarInfo } from '../types/calendar'

const VIRTUAL_BIRTHDAYS: CalendarInfo = {
  id: 'virtual-birthdays',
  url: 'virtual-birthdays',
  displayName: 'Birthdays & Anniversaries',
  color: '#ec4899',
  isShared: false,
  canWrite: false,
  supportsEvents: true,
  supportsTasks: false,
  isVirtual: true,
}

export function useCalendars() {
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const [cals, subs] = await Promise.all([getCalendars(), getSubscriptions()])
      setCalendars([...cals, ...subs, VIRTUAL_BIRTHDAYS])
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to load calendars')
    }
  }, [])

  useEffect(() => {
    refetch().finally(() => setLoading(false))
  }, [refetch])

  return { calendars, loading, error, refetch }
}

