// Stub all lucide-react icon components for Jest/jsdom environment
import React from 'react';

const Icon = ({ size: _size, className }: { size?: number; className?: string }) =>
  React.createElement('span', { className, 'data-testid': 'icon' });

export const Bell = Icon;
export const BellOff = Icon;
export const BellRing = Icon;
export const AlertCircle = Icon;
export const CheckCircle = Icon;
