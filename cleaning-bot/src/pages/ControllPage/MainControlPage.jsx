import PageContainer from "@/components/layout/PageContainer";
import React from "react";
import LiveControlPage from "./components/LiveControlPage";

const MainControlPage = () => {
  return (
    <PageContainer scrollable>
      <LiveControlPage />
    </PageContainer>
  );
};

export default MainControlPage;
