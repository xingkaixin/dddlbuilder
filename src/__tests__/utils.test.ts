import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('Utils', () => {
  describe('cn function', () => {
    it('should merge class names correctly', () => {
      expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white')
    })

    it('should handle empty strings', () => {
      expect(cn('bg-red-500', '', 'text-white')).toBe('bg-red-500 text-white')
      expect(cn('', '', '')).toBe('')
    })

    it('should handle undefined and null values', () => {
      expect(cn('bg-red-500', undefined, 'text-white')).toBe('bg-red-500 text-white')
      expect(cn('bg-red-500', null, 'text-white')).toBe('bg-red-500 text-white')
      expect(cn(undefined, null, '')).toBe('')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const isError = false

      expect(cn('base-class', isActive && 'active', isError && 'error')).toBe(
        'base-class active'
      )
    })

    it('should handle arrays of classes', () => {
      expect(cn(['bg-red-500', 'text-white'], 'border')).toBe(
        'bg-red-500 text-white border'
      )
    })

    it('should handle objects with boolean values', () => {
      expect(cn({
        'bg-red-500': true,
        'text-white': true,
        'border': false,
        'shadow': undefined
      })).toBe('bg-red-500 text-white')
    })

    it('should handle mixed input types', () => {
      expect(cn(
        'base',
        ['extra1', 'extra2'],
        {
          'conditional1': true,
          'conditional2': false
        },
        'final'
      )).toBe('base extra1 extra2 conditional1 final')
    })

    it('should handle complex Tailwind class combinations', () => {
      expect(cn(
        'flex flex-col gap-4',
        'bg-white dark:bg-gray-800',
        'text-gray-900 dark:text-gray-100',
        'border border-gray-200 dark:border-gray-700',
        'rounded-lg shadow-sm',
        'hover:shadow-md transition-shadow'
      )).toBe(
        'flex flex-col gap-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow'
      )
    })

    it('should handle conflicting Tailwind classes correctly', () => {
      // Tailwind CSS classes are ordered, later classes should override earlier ones
      expect(cn('bg-red-500 bg-blue-500')).toBe('bg-blue-500')
      expect(cn('text-sm text-lg')).toBe('text-lg')
      expect(cn('p-4 p-8')).toBe('p-8')
    })

    it('should handle Tailwind modifiers', () => {
      expect(cn(
        'hover:bg-blue-500',
        'focus:outline-none',
        'disabled:opacity-50',
        'sm:text-lg lg:text-xl',
        'dark:bg-gray-800'
      )).toBe(
        'hover:bg-blue-500 focus:outline-none disabled:opacity-50 sm:text-lg lg:text-xl dark:bg-gray-800'
      )
    })

    it('should handle arbitrary values', () => {
      expect(cn('w-[100px]', 'h-[50px]', 'grid-cols-[1fr,2fr]')).toBe(
        'w-[100px] h-[50px] grid-cols-[1fr,2fr]'
      )
    })

    it('should handle duplicate classes', () => {
      expect(cn('bg-red-500', 'bg-red-500', 'text-white', 'text-white')).toBe(
        'bg-red-500 text-white'
      )
    })

    it('should handle very long class strings', () => {
      const longClasses = ' '.repeat(100).split(' ').map((_, i) => `class-${i}`)
      const result = cn(...longClasses)

      expect(result).toBe(longClasses.join(' '))
    })

    it('should handle whitespace correctly', () => {
      expect(cn('  bg-red-500  ', '  text-white  ')).toBe('bg-red-500 text-white')
      expect(cn('bg-red-500\n\ttext-white')).toBe('bg-red-500 text-white')
    })

    it('should work with real-world component class scenarios', () => {
      // Button component classes
      expect(cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        'h-9 px-4 py-2'
      )).toContain('inline-flex items-center justify-center')
      expect(cn('inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2')).toContain('bg-primary')

      // Card component classes
      expect(cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        'p-6'
      )).toBe('rounded-lg border bg-card text-card-foreground shadow-sm p-6')

      // Input component classes
      expect(cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )).toContain('flex h-10 w-full rounded-md')
    })

    it('should handle edge cases gracefully', () => {
      // All falsy values
      expect(cn(false, null, undefined, 0, '', 'valid-class')).toBe('valid-class')

      // Numbers (should be converted to string)
      expect(cn(1, 2, 'string-class')).toBe('1 2 string-class')

      // Mixed complex case
      expect(cn(
        '',
        null,
        undefined,
        'base-class',
        ['array-class-1', ''],
        { 'object-class-1': true, 'object-class-2': false },
        false,
        'final-class'
      )).toBe('base-class array-class-1 object-class-1 final-class')
    })
  })
})