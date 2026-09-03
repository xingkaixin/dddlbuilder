import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/__tests__/utils/queryClient';

// Custom render function with providers if needed
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  const queryClient = createTestQueryClient();
  // Wrap with TooltipProvider for components using Tooltip
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override the default render with our custom one
export { customRender as render };

// Helper functions for common test operations
export const waitForAnimationFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

// Helper to test async operations
export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
