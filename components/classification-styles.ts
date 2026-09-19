// components/classification-styles.ts
import { AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

export interface ClassificationStyle {
  bg: string;
  border: string;
  text: string;
  badge: string;
  icon: typeof AlertTriangle;
}

export const classificationStyles: Record<string, ClassificationStyle> = {
  UNACCEPTABLE_RISK: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-900',
    badge: 'bg-red-100 text-red-800',
    icon: AlertTriangle,
  },
  HIGH_RISK: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-900',
    badge: 'bg-orange-100 text-orange-800',
    icon: AlertCircle,
  },
  LIMITED_RISK: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-300',
    text: 'text-yellow-900',
    badge: 'bg-yellow-100 text-yellow-800',
    icon: AlertCircle,
  },
  MINIMAL_RISK: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-900',
    badge: 'bg-green-100 text-green-800',
    icon: CheckCircle,
  },
  GPAI: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-900',
    badge: 'bg-blue-100 text-blue-800',
    icon: CheckCircle,
  },
};

export const fallbackClassificationStyle = classificationStyles.MINIMAL_RISK;

export function getClassificationStyle(classification: string): ClassificationStyle {
  return classificationStyles[classification] ?? fallbackClassificationStyle;
}
