/**
 * The `?destination=` value for a catalogue city. Indian ids match their city
 * name (`goa`); a city abroad has an id like `city_th_bangkok`, so it goes by
 * its name, which is what its products' `city` holds (ADR 023).
 */
export function destinationParam(destination) {
  if (!destination) return "";
  return destination.country && destination.country !== "India" ? destination.name : destination.id || destination.name;
}
