import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { navLinks } from '@/constants/NavLinks';

const BottomNavLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = React.useState(0);

  useEffect(() => {
    const currentPathIndex = navLinks.findIndex(link => link.path === location.pathname);
    if (currentPathIndex !== -1) {
      setValue(currentPathIndex);
    }
  }, [location]);

  const handleChange = (newValue) => {
    setValue(newValue);
    navigate(navLinks[newValue].path);
  };

  return (
    <div className="flex flex-col min-h-screen pb-16">
      <div className="flex-1">
        {children}
      </div>
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background">
        <div className="flex h-16 items-center justify-around">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.id}
                onClick={() => handleChange(link.id)}
                className={cn(
                  "flex flex-col items-center justify-center w-full h-full",
                  value === link.id ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xs mt-1">{link.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BottomNavLayout;
