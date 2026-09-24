import type { CharacterId } from "../characters/characterProfiles";
import type { SceneFamilyId } from "./sceneRoleplays";
import mike from "../assets/characters/thumbnails/mike.webp";
import sophie from "../assets/characters/thumbnails/sophie.webp";
import jamie from "../assets/characters/thumbnails/jamie.webp";
import lily from "../assets/characters/thumbnails/lily.webp";
import grandmaRose from "../assets/characters/thumbnails/grandma_rose.webp";
import drDan from "../assets/characters/thumbnails/dr_dan.webp";
import leo from "../assets/characters/thumbnails/leo.webp";
import miyabi from "../assets/characters/thumbnails/miyabi.webp";
import anyone from "../assets/characters/thumbnails/anyone.webp";
import hotel from "../assets/backgrounds/thumbnails/hotel.webp";
import airport from "../assets/backgrounds/thumbnails/airport.webp";
import street from "../assets/backgrounds/thumbnails/street.webp";
import restaurant from "../assets/backgrounds/thumbnails/restaurant.webp";
import market from "../assets/backgrounds/thumbnails/market.webp";
import station from "../assets/backgrounds/thumbnails/station.webp";
import hospital from "../assets/backgrounds/thumbnails/hospital.webp";
import fastfood from "../assets/backgrounds/thumbnails/fastfood.webp";

export const PARTNER_THUMBNAILS: Readonly<Partial<Record<CharacterId, string>>> = {
  mike,
  sophie,
  jamie,
  lily,
  grandma_rose: grandmaRose,
  dr_dan: drDan,
  leo,
  miyabi,
};

export const ANYONE_THUMBNAIL = anyone;

export const SCENE_THUMBNAILS: Readonly<Record<SceneFamilyId, string>> = {
  hotel,
  airport,
  street,
  restaurant,
  shopping: market,
  transportation: station,
  hospital,
  fastfood,
};
