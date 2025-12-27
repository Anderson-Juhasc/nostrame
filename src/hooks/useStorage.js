import { useState, useEffect, useCallback } from 'react'
import browser from 'webextension-polyfill'

/**
 * Custom hook for browser.storage.local with automatic sync
 * @param {string} key - Storage key to watch
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {[any, function, boolean]} - [value, setValue, loading]
 */
export function useStorage(key, defaultValue = null) {
  const [value, setValue] = useState(defaultValue)
  const [loading, setLoading] = useState(true)

  // Initial fetch
  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      try {
        const storage = await browser.storage.local.get([key])
        if (mounted) {
          setValue(storage[key] ?? defaultValue)
          setLoading(false)
        }
      } catch (err) {
        console.error(`useStorage: Failed to fetch ${key}`, err)
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, [key, defaultValue])

  // Listen for changes
  useEffect(() => {
    const handleChange = (changes, area) => {
      if (area === 'local' && changes[key]) {
        setValue(changes[key].newValue ?? defaultValue)
      }
    }

    browser.storage.onChanged.addListener(handleChange)

    return () => {
      browser.storage.onChanged.removeListener(handleChange)
    }
  }, [key, defaultValue])

  // Setter function
  const setStorageValue = useCallback(async (newValue) => {
    try {
      const valueToStore = typeof newValue === 'function'
        ? newValue(value)
        : newValue
      await browser.storage.local.set({ [key]: valueToStore })
      setValue(valueToStore)
    } catch (err) {
      console.error(`useStorage: Failed to set ${key}`, err)
    }
  }, [key, value])

  return [value, setStorageValue, loading]
}

/**
 * Hook for watching multiple storage keys
 * @param {string[]} keys - Array of storage keys to watch
 * @returns {[object, boolean]} - [values object, loading]
 */
export function useStorageMultiple(keys) {
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)

  // Initial fetch
  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      try {
        const storage = await browser.storage.local.get(keys)
        if (mounted) {
          setValues(storage)
          setLoading(false)
        }
      } catch (err) {
        console.error('useStorageMultiple: Failed to fetch', err)
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, [keys.join(',')])

  // Listen for changes
  useEffect(() => {
    const handleChange = (changes, area) => {
      if (area === 'local') {
        const relevantChanges = {}
        let hasChanges = false

        keys.forEach(key => {
          if (changes[key]) {
            relevantChanges[key] = changes[key].newValue
            hasChanges = true
          }
        })

        if (hasChanges) {
          setValues(prev => ({ ...prev, ...relevantChanges }))
        }
      }
    }

    browser.storage.onChanged.addListener(handleChange)

    return () => {
      browser.storage.onChanged.removeListener(handleChange)
    }
  }, [keys.join(',')])

  return [values, loading]
}

export default useStorage
