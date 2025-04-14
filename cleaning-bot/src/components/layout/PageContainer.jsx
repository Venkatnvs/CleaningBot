import React from 'react';
import { ScrollArea } from '../ui/scroll-area';
import BottomNavLayout from './bottomNavLayout';
import Header from './Header';

const PageContainer = ({ children, scrollable = false }) => {
  return (
    <BottomNavLayout>
      <div className='flex flex-col h-full bg-background'>
        <Header />
        <main className='flex-1 overflow-hidden'>
          {scrollable ? (
            <ScrollArea className='h-[calc(100dvh-121px)] px-4 md:px-6 py-4'>
              <div className='max-w-7xl mx-auto'>
                {children}
              </div>
            </ScrollArea>
          ) : (
            <div className='h-full px-4 md:px-6 py-4'>
              <div className='max-w-7xl mx-auto h-full'>
                {children}
              </div>
            </div>
          )}
        </main>
      </div>
    </BottomNavLayout>
  );
};

export default PageContainer;
