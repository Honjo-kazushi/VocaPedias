import airport from "../assets/backgrounds/airport.png";
import cafe from "../assets/backgrounds/cafe.png";
import classroom from "../assets/backgrounds/classroom.png";
import home from "../assets/backgrounds/home.png";
import office from "../assets/backgrounds/office.png";
import park from "../assets/backgrounds/park.png";
import restaurant from "../assets/backgrounds/restaurant.png";
import station from "../assets/backgrounds/station.png";
import street from "../assets/backgrounds/street.png";

export const DEFAULT_TOPIC_BACKGROUND = cafe;

export const TOPIC_BACKGROUND_MAP: Readonly<Record<string, string>> = {
  topic001: office,      // The Internet
  topic002: airport,     // Astronauts
  topic003: park,        // Sports
  topic004: home,        // Stress
  topic005: street,      // Trends
  topic006: home,        // Emotions
  topic007: cafe,        // Entertainment
  topic008: restaurant,  // Japanese Manners
  topic009: classroom,   // Writing
  topic010: park,        // Wishes
  topic011: park,        // The Outdoors
  topic012: cafe,        // Friends
  topic013: park,        // Pets
  topic014: office,      // Accomplishments
  topic015: station,     // Extreme Experiences
};

export function getTopicBackground(topicId: string): string {
  return TOPIC_BACKGROUND_MAP[topicId] ?? DEFAULT_TOPIC_BACKGROUND;
}
