export interface Demographics {
  asianPopulation: number;
  stateTotalPopulation: number;
  asianPercentOfState: number;
}

export interface CityData {
  id: string;
  name: string;
  demographics: Demographics;
}

export interface Item {
  id: string;
  name: string;
  unit: string;
}

export interface PriceData {
  itemId: string;
  currentPrice: number;
  previousYearPrice: number;
  history: number[]; // e.g., representing monthly data from previous year to current
}

export interface InflationData {
  cities: CityData[];
  items: Item[];
  prices: Record<string, PriceData[]>; // Record where key is city id
}
