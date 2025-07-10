import React from 'react';

const About: React.FC = () => {
  return (
    <div className="min-h-screen bg-brand-dark p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-theme-primary mb-8">Hakkında</h1>
        <p className="text-theme-secondary">CineMatch hakkında bilgiler</p>
      </div>
    </div>
  );
};

export default About;