import type { Phrase } from "../app/ports/PhraseRepository";
import type { CharacterId } from "../characters/characterProfiles";
import { PHRASES_SCENE } from "./phrases.scene";
import { PHRASES_SEED } from "./phrases.seed";

export type SceneFamilyId = "hotel" | "airport" | "street" | "restaurant" | "shopping" | "transportation" | "hospital";
export type SceneSituation = { id: string; sceneId: SceneFamilyId; sceneTitle: string; title: string; learnerRole: string; partnerRole: string; goal: string; usefulPhraseIds: readonly string[]; possibleComplications: readonly string[]; partnerCandidates: readonly CharacterId[] };
export type SceneRoleplay = { id: SceneFamilyId; title: string; shortLabel: string; situations: readonly SceneSituation[] };
type Seed = Omit<SceneSituation, "sceneId" | "sceneTitle" | "partnerCandidates">;

const PARTNERS: Record<SceneFamilyId, readonly CharacterId[]> = {
  hotel: ["sophie", "jamie", "grandma_rose", "mike", "lily"],
  airport: ["jamie", "sophie", "leo", "mike", "lily"],
  street: ["mike", "lily", "leo", "jamie", "grandma_rose"],
  restaurant: ["sophie", "grandma_rose", "mike", "lily", "jamie"],
  shopping: ["lily", "sophie", "jamie", "grandma_rose", "mike"],
  transportation: ["mike", "leo", "jamie", "lily", "sophie"],
  hospital: ["dr_dan", "sophie", "grandma_rose", "jamie"],
};
const q = (id: string, title: string, learnerRole: string, partnerRole: string, goal: string, usefulPhraseIds: string[], possibleComplications: string[] = []): Seed => ({ id, title, learnerRole, partnerRole, goal, usefulPhraseIds, possibleComplications });
const f = (id: SceneFamilyId, title: string, shortLabel: string, situations: Seed[]): SceneRoleplay => ({ id, title, shortLabel, situations: situations.map((item) => ({ ...item, sceneId: id, sceneTitle: title, partnerCandidates: PARTNERS[id] })) });

export const SCENE_ROLEPLAYS: readonly SceneRoleplay[] = [
  f("hotel", "Hotel", "予約・滞在・トラブル", [
    q("hotel-reservation", "Reservation", "a traveler booking a hotel room", "a hotel reservation agent", "Make or confirm a room reservation.", ["h101", "h102", "h104", "h105"], ["Only one room type is available."]),
    q("hotel-check-in", "Check-in", "a hotel guest arriving to check in", "a hotel receptionist", "Complete check-in and understand the room information.", ["h107", "h104", "h114", "h121"], ["The reservation takes a moment to find."]),
    q("hotel-breakfast", "Asking about breakfast", "a hotel guest asking about breakfast", "a hotel receptionist", "Find out whether breakfast is included and when or where it is served.", ["h113", "h111", "h118", "h149"]),
    q("hotel-wifi", "Asking about Wi-Fi", "a hotel guest who needs internet access", "a hotel receptionist", "Learn whether Wi-Fi is available and how to connect.", ["h130", "h148", "h131"], ["The first connection attempt does not work."]),
    q("hotel-request", "Requesting something", "a hotel guest making a simple request", "a hotel front-desk employee", "Make a request and understand how it will be handled.", ["h142", "h143", "h144", "h146", "h147"]),
    q("hotel-problem", "Reporting a problem", "a hotel guest reporting a room problem", "a hotel front-desk employee", "Explain the problem and learn what the hotel will do.", ["h131", "h123", "h126", "h134", "h137"], ["The staff needs to check the room first."]),
    q("hotel-room-change", "Changing a room", "a guest who wants a different room", "a hotel receptionist", "Explain why a room change is needed and agree on the next step.", ["h125", "h129", "h135", "h139"], ["A new room will not be ready immediately."]),
    q("hotel-check-out", "Check-out", "a hotel guest checking out", "a hotel receptionist", "Complete check-out and settle the bill.", ["h117", "h118", "h119", "h120", "h147"], ["There is one extra charge to clarify."]),
  ]),
  f("airport", "Airport", "搭乗・入国・手荷物", [
    q("airport-check-in", "Airline check-in", "an airline passenger checking in", "an airline check-in agent", "Complete airline check-in and understand the next step.", ["m222", "m224", "h147", "t230"], ["The boarding gate has changed."]),
    q("airport-baggage", "Checking baggage", "a passenger checking a bag", "an airline check-in agent", "Check the bag and understand any baggage requirement.", ["h147", "s421", "s432", "t230"], ["The bag is slightly over the weight limit."]),
    q("airport-security", "Security", "a passenger going through airport security", "an airport security officer", "Follow the basic security instructions and complete screening.", ["t057", "t230", "m249"], ["One item needs an additional check."]),
    q("airport-immigration", "Immigration", "a traveler entering a country for a short visit", "an immigration officer", "Answer the basic entry questions and complete immigration.", ["h104", "t230", "t354", "m214"], ["The length of stay needs clarification."]),
    q("airport-gate", "Finding a gate", "a passenger looking for a boarding gate", "an airport staff member", "Find the correct gate and understand how to get there.", ["m238", "m251", "m253", "m263", "t230"], ["The gate has recently changed."]),
    q("airport-boarding-time", "Asking about boarding time", "a passenger checking when boarding begins", "an airline gate agent", "Confirm the boarding time and whether boarding is ready.", ["m211", "m213", "m218", "m219"]),
    q("airport-delay", "Delayed flight", "a passenger whose flight is delayed", "an airline gate agent", "Understand the delay and the next available update or action.", ["m219", "m220", "m246", "t230"], ["The departure time changes once more."]),
    q("airport-lost-baggage", "Lost baggage", "a traveler whose checked bag did not arrive", "an airline baggage-service employee", "Report the missing bag and understand the follow-up process.", ["m241", "m249", "t552", "h159"], ["A description of the bag is needed."]),
  ]),
  f("street", "Street / Directions", "道を尋ねる・説明する", [
    q("street-asking-directions", "Asking for directions", "a traveler trying to find a place", "a local person", "Ask for directions and confirm enough information to continue.", ["m241", "m208", "m238", "m249"], ["The route has an important turn."]),
    q("street-giving-directions", "Being asked for directions", "a local person giving directions", "a traveler looking for a place", "Give clear directions or explain that the place is not known.", ["m251", "m253", "m254", "m268"], ["The traveler asks for a landmark."]),
    q("street-repeat", "Asking someone to repeat", "a traveler who missed part of some directions", "a local person", "Ask for repetition and confirm the key direction.", ["t230", "h164", "m266"]),
    q("street-explaining-location", "Explaining where a place is", "a local person describing a location", "a traveler", "Explain the location using landmarks or position words.", ["m261", "m262", "m268", "m269", "m270"]),
    q("street-distance", "Confirming distance", "a traveler checking whether a destination is nearby", "a local person", "Understand whether the place is close or far.", ["m263", "m264", "m265"]),
    q("street-travel-time", "Asking how long it takes", "a traveler asking about travel time", "a local person", "Find out approximately how long the journey takes.", ["m214", "t239", "t505"]),
    q("street-do-not-know", "Saying you do not know", "a local person who does not know the place", "a traveler", "Politely explain that the location is not known and offer a next step.", ["t230", "m249", "t552"]),
  ]),
  f("restaurant", "Restaurant", "入店・注文・会計", [
    q("restaurant-table", "Asking for a table", "a customer entering a restaurant", "a restaurant host", "Ask for a table and be seated.", ["r301", "r302", "r305", "r307"]),
    q("restaurant-ordering", "Ordering", "a customer ready to order", "a restaurant server", "Place a food and drink order.", ["r311", "r312", "r315", "r317"], ["One item is sold out."]),
    q("restaurant-dish", "Asking about a dish", "a customer asking about menu items", "a restaurant server", "Understand what a dish is like before ordering.", ["r321", "r327", "r328", "r325"]),
    q("restaurant-recommendation", "Asking for a recommendation", "a customer choosing a meal", "a restaurant server", "Get a recommendation and decide what to order.", ["r313", "r314", "r328"]),
    q("restaurant-dietary", "Dietary request", "a customer with a dietary need", "a restaurant server", "Explain the dietary request and confirm a suitable choice.", ["r322", "r323", "r324", "r349"]),
    q("restaurant-wrong-order", "Wrong order", "a customer who received the wrong dish", "a restaurant server", "Explain the problem and agree on a replacement.", ["r341", "r343", "r347", "r348"], ["The replacement takes a few minutes."]),
    q("restaurant-bill", "Asking for the bill", "a customer ready to pay", "a restaurant server", "Request and pay the bill.", ["r331", "r332", "r334", "r336", "r339"]),
  ]),
  f("shopping", "Shopping", "商品・試着・支払い", [
    q("shopping-price", "Asking the price", "a customer checking a price", "a shop assistant", "Find out the price and any discount or tax.", ["s421", "s423", "s425", "s427"]),
    q("shopping-size", "Asking for another size", "a customer needing a different size", "a shop assistant", "Ask for and evaluate another size.", ["s411", "s412", "s416", "s417"], ["The requested size is unavailable."]),
    q("shopping-color", "Asking for another color", "a customer looking for another color", "a shop assistant", "Ask whether another color is available.", ["s419", "s402", "s405", "s420"], ["Only one other color is available."]),
    q("shopping-try-on", "Trying something on", "a customer who wants to try an item", "a shop assistant", "Ask to try the item and find the fitting room.", ["s414", "s415", "s416", "s420"]),
    q("shopping-return", "Returning an item", "a customer returning or exchanging an item", "a shop assistant", "Explain the problem and arrange a return, exchange, or refund.", ["s441", "s444", "s445", "s446", "s448"]),
    q("shopping-paying", "Paying", "a customer purchasing an item", "a cashier", "Complete payment and handle the receipt or bag.", ["s431", "s432", "s434", "s436", "s438"]),
  ]),
  f("transportation", "Transportation", "切符・乗換・タクシー", [
    q("transport-ticket", "Buying a ticket", "a traveler buying a ticket", "a station ticket clerk", "Buy the correct ticket and understand the fare.", ["m221", "m222", "m224", "m226"]),
    q("transport-which-service", "Which train or bus", "a traveler choosing a train or bus", "a station or bus staff member", "Identify the correct service for the destination.", ["m201", "m202", "m204", "m239"]),
    q("transport-transfer", "Asking about transfers", "a passenger checking a route", "a station staff member", "Understand where and how to transfer.", ["m231", "m232", "m234", "m236"]),
    q("transport-missed", "Missing a train", "a traveler who missed a train", "a station staff member", "Find the next practical travel option.", ["m216", "m219", "m242", "m246", "m248"], ["The next service requires a transfer."]),
    q("transport-taxi", "Giving a taxi destination", "a taxi passenger", "a taxi driver", "State the destination and confirm the basic journey.", ["m210", "m214", "m221", "t524"]),
    q("transport-fare", "Asking the fare", "a passenger checking the price", "a driver or ticket clerk", "Find out the fare and payment method.", ["m221", "m224", "m226", "m230"]),
  ]),
  f("hospital", "Hospital / Clinic", "受付・症状・薬", [
    q("hospital-symptoms", "Explaining symptoms", "a traveler explaining a basic symptom", "a clinic staff member", "Communicate the main symptom and get the next basic instruction.", ["h611", "h612", "h613", "h614", "h618", "h619"]),
    q("hospital-symptom-start", "When symptoms started", "a patient explaining when a symptom began", "a clinic staff member", "Explain when the symptom started and answer a follow-up.", ["h615", "h616", "h617", "h620"]),
    q("hospital-medicine", "Asking about medicine", "a patient asking about prescribed medicine", "a clinic or pharmacy staff member", "Understand how and when to take the medicine.", ["h631", "h633", "h635", "h637", "h639"]),
    q("hospital-instructions", "Understanding instructions", "a patient receiving basic instructions", "a clinic staff member", "Confirm and follow simple non-diagnostic clinic instructions.", ["h622", "h627", "h628", "h632", "h636"]),
  ]),
];

const PHRASES_BY_ID = new Map<string, Phrase>([...PHRASES_SCENE, ...PHRASES_SEED].map((phrase) => [phrase.id, phrase]));
const previousSituationByFamily = new Map<SceneFamilyId, string>();
export function getSceneUsefulPhrases(value: SceneSituation): Phrase[] { return value.usefulPhraseIds.flatMap((id) => { const phrase = PHRASES_BY_ID.get(id); return phrase ? [phrase] : []; }); }
export function chooseSceneSituation(scene: SceneRoleplay, random: () => number = Math.random): SceneSituation { const previous = previousSituationByFamily.get(scene.id); const choices = scene.situations.filter((item) => scene.situations.length === 1 || item.id !== previous); const selected = choices[Math.floor(random() * choices.length)]; previousSituationByFamily.set(scene.id, selected.id); return selected; }
export function chooseScenePartner(value: SceneSituation, previousCharacter: CharacterId | null = null, random: () => number = Math.random): CharacterId { const choices = value.partnerCandidates.filter((id) => value.partnerCandidates.length === 1 || id !== previousCharacter); return choices[Math.floor(random() * choices.length)]; }
export function chooseSceneComplication(value: SceneSituation, random: () => number = Math.random): string | null { if (!value.possibleComplications.length || random() < 0.6) return null; return value.possibleComplications[Math.floor(random() * value.possibleComplications.length)]; }
