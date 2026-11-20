// Northern Ireland towns by name. postcodes.io's place search only covers Great Britain, so these are bundled instead:
// ~50 places, a couple of KB, no extra request. Radius is in miles. NI postcodes (BT…) already work through the postcode search.
export interface NiPlace { name: string; county: string; type: 'City' | 'Town' | 'Village'; lat: number; lon: number; miles: number; alias?: string[] }

export const NI_PLACES: NiPlace[] = [
  { name: 'Belfast', county: 'County Antrim', type: 'City', lat: 54.5973, lon: -5.9301, miles: 8 },
  { name: 'Derry', county: 'County Londonderry', type: 'City', lat: 54.9966, lon: -7.3086, miles: 5, alias: ['Londonderry'] },
  { name: 'Lisburn', county: 'County Antrim', type: 'City', lat: 54.5162, lon: -6.058, miles: 4 },
  { name: 'Newry', county: 'County Down', type: 'City', lat: 54.1751, lon: -6.3402, miles: 4 },
  { name: 'Armagh', county: 'County Armagh', type: 'City', lat: 54.3503, lon: -6.6528, miles: 4 },
  { name: 'Bangor', county: 'County Down', type: 'Town', lat: 54.6538, lon: -5.6689, miles: 4 },
  { name: 'Craigavon', county: 'County Armagh', type: 'Town', lat: 54.4477, lon: -6.387, miles: 4 },
  { name: 'Newtownabbey', county: 'County Antrim', type: 'Town', lat: 54.67, lon: -5.91, miles: 4, alias: ['Glengormley'] },
  { name: 'Carrickfergus', county: 'County Antrim', type: 'Town', lat: 54.7135, lon: -5.8056, miles: 3 },
  { name: 'Ballymena', county: 'County Antrim', type: 'Town', lat: 54.8638, lon: -6.2811, miles: 3 },
  { name: 'Coleraine', county: 'County Londonderry', type: 'Town', lat: 55.1327, lon: -6.6699, miles: 3 },
  { name: 'Antrim', county: 'County Antrim', type: 'Town', lat: 54.7195, lon: -6.2072, miles: 3 },
  { name: 'Larne', county: 'County Antrim', type: 'Town', lat: 54.853, lon: -5.8218, miles: 3 },
  { name: 'Newtownards', county: 'County Down', type: 'Town', lat: 54.5903, lon: -5.6968, miles: 3 },
  { name: 'Omagh', county: 'County Tyrone', type: 'Town', lat: 54.5978, lon: -7.3, miles: 3 },
  { name: 'Enniskillen', county: 'County Fermanagh', type: 'Town', lat: 54.3438, lon: -7.6397, miles: 3 },
  { name: 'Dungannon', county: 'County Tyrone', type: 'Town', lat: 54.5033, lon: -6.7667, miles: 3 },
  { name: 'Cookstown', county: 'County Tyrone', type: 'Town', lat: 54.6446, lon: -6.7452, miles: 3 },
  { name: 'Portadown', county: 'County Armagh', type: 'Town', lat: 54.423, lon: -6.444, miles: 3 },
  { name: 'Lurgan', county: 'County Armagh', type: 'Town', lat: 54.4663, lon: -6.335, miles: 3 },
  { name: 'Banbridge', county: 'County Down', type: 'Town', lat: 54.35, lon: -6.27, miles: 3 },
  { name: 'Downpatrick', county: 'County Down', type: 'Town', lat: 54.3283, lon: -5.7163, miles: 3 },
  { name: 'Ballymoney', county: 'County Antrim', type: 'Town', lat: 55.0702, lon: -6.5173, miles: 3 },
  { name: 'Limavady', county: 'County Londonderry', type: 'Town', lat: 55.0525, lon: -6.95, miles: 3 },
  { name: 'Strabane', county: 'County Tyrone', type: 'Town', lat: 54.8267, lon: -7.4636, miles: 3 },
  { name: 'Magherafelt', county: 'County Londonderry', type: 'Town', lat: 54.7558, lon: -6.6063, miles: 3 },
  { name: 'Holywood', county: 'County Down', type: 'Town', lat: 54.64, lon: -5.83, miles: 3 },
  { name: 'Comber', county: 'County Down', type: 'Town', lat: 54.55, lon: -5.745, miles: 3 },
  { name: 'Newcastle', county: 'County Down', type: 'Town', lat: 54.215, lon: -5.889, miles: 3 },
  { name: 'Ballycastle', county: 'County Antrim', type: 'Town', lat: 55.2, lon: -6.24, miles: 3 },
  { name: 'Portrush', county: 'County Antrim', type: 'Town', lat: 55.2064, lon: -6.654, miles: 3 },
  { name: 'Portstewart', county: 'County Londonderry', type: 'Town', lat: 55.185, lon: -6.717, miles: 3 },
  { name: 'Kilkeel', county: 'County Down', type: 'Town', lat: 54.06, lon: -6.0, miles: 3 },
  { name: 'Warrenpoint', county: 'County Down', type: 'Town', lat: 54.1, lon: -6.257, miles: 3 },
  { name: 'Dromore', county: 'County Down', type: 'Town', lat: 54.415, lon: -6.15, miles: 3 },
  { name: 'Randalstown', county: 'County Antrim', type: 'Town', lat: 54.75, lon: -6.31, miles: 3 },
  { name: 'Ballynahinch', county: 'County Down', type: 'Town', lat: 54.404, lon: -5.897, miles: 3 },
  { name: 'Saintfield', county: 'County Down', type: 'Village', lat: 54.46, lon: -5.83, miles: 2 },
  { name: 'Donaghadee', county: 'County Down', type: 'Town', lat: 54.643, lon: -5.534, miles: 3 },
  { name: 'Moira', county: 'County Down', type: 'Village', lat: 54.475, lon: -6.24, miles: 2 },
  { name: 'Maghera', county: 'County Londonderry', type: 'Town', lat: 54.845, lon: -6.67, miles: 3 },
  { name: 'Dungiven', county: 'County Londonderry', type: 'Town', lat: 54.925, lon: -6.92, miles: 3 },
  { name: 'Fivemiletown', county: 'County Tyrone', type: 'Village', lat: 54.255, lon: -7.3, miles: 2 },
  { name: 'Lisnaskea', county: 'County Fermanagh', type: 'Town', lat: 54.25, lon: -7.45, miles: 3 },
  { name: 'Irvinestown', county: 'County Fermanagh', type: 'Town', lat: 54.47, lon: -7.63, miles: 3 },
  { name: 'Castlederg', county: 'County Tyrone', type: 'Town', lat: 54.7, lon: -7.58, miles: 3 },
  { name: 'Rathfriland', county: 'County Down', type: 'Town', lat: 54.236, lon: -6.163, miles: 2 },
  { name: 'Whitehead', county: 'County Antrim', type: 'Village', lat: 54.75, lon: -5.71, miles: 2 },
  { name: 'Dundonald', county: 'County Down', type: 'Town', lat: 54.59, lon: -5.8, miles: 3 },
  { name: 'Carryduff', county: 'County Down', type: 'Village', lat: 54.51, lon: -5.87, miles: 2 },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Names that start with what was typed (so "newt" finds Newtownards), exact matches first. */
export function searchNiPlaces(q: string): NiPlace[] {
  const n = norm(q);
  if (n.length < 3) return [];
  const names = (p: NiPlace) => [p.name, ...(p.alias ?? [])].map(norm);
  const exact = NI_PLACES.filter((p) => names(p).includes(n));
  return exact.length ? exact : NI_PLACES.filter((p) => names(p).some((x) => x.startsWith(n)));
}
