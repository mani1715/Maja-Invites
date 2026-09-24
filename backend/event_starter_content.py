"""
event_starter_content.py — MAJA Dynamic Event Engine: MAJA-drafted starter copy (v2 §6).
=========================================================================================

The owner picks a main language (en/te/hi) + a story style (devotional/traditional) and
inserts this ready copy into the builder, then edits it. Nothing is auto-filled — the
host clicks "Use starter text", so proper nouns stay under their control. All text is a
STARTER the host is expected to review and adjust; the endpoint falls back
lang→en and option→devotional when a variant is missing.

Fields: welcome_message, about_text, meaning_text, invitation_note (closing blessing).
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

import event_registry as registry

CONTENT: Dict[str, Dict[str, Dict[str, Dict[str, str]]]] = {
    "ganesh_chaturthi": {
        "en": {
            "devotional": {
                "welcome_message": ("Every year, Lord Ganesha fills our home with wisdom, happiness and "
                                    "prosperity. With immense gratitude we are blessed to celebrate another "
                                    "year of our Vinayaka Chaturthi. Your presence and blessings have been an "
                                    "inseparable part of this beautiful journey — we would be honoured to "
                                    "welcome you once again."),
                "about_text": ("Lord Ganesha is worshipped as the remover of obstacles and the giver of wisdom, "
                               "prosperity and new beginnings. Ganesh Chaturthi marks His arrival into our homes "
                               "— a time of prayer, music, prasad and togetherness."),
                "meaning_text": ("This celebration is not merely an annual tradition — it is our family's "
                                "expression of gratitude to Lord Ganesha for His countless blessings. Every year "
                                "strengthens our faith and brings our loved ones closer together."),
                "invitation_note": ("May Lord Ganesha remove every obstacle from your life and bless your family "
                                   "with wisdom, prosperity, good health and endless happiness."),
            },
            "traditional": {
                "welcome_message": ("With the divine blessings of Lord Ganesha, we warmly invite you and your "
                                   "family to be a part of our Sri Vinayaka Chaturthi celebrations. Your gracious "
                                   "presence will make this sacred occasion truly complete."),
                "about_text": ("Sri Vinayaka, the first among the gods to be worshipped, is the lord of wisdom "
                              "and the remover of all obstacles. We gather in devotion to invoke His blessings "
                              "upon our families and our community."),
                "meaning_text": ("Held in the spirit of devotion and gratitude, this utsav is our humble offering "
                                "to Sri Vinayaka — a tradition that unites our family and friends year after year."),
                "invitation_note": ("May Sri Vinayaka bless you and your family with health, wealth, wisdom and "
                                   "peace. Ganapathi Bappa Morya!"),
            },
        },
        "te": {
            "devotional": {
                "welcome_message": ("ప్రతి సంవత్సరం వినాయకుడు మా ఇంటిని జ్ఞానం, ఆనందం, సౌభాగ్యంతో నింపుతాడు. ఈ "
                                    "సంవత్సరం కూడా మా వినాయక చవితి ఉత్సవాలను జరుపుకోవడానికి మేము ధన్యులమయ్యాము. మీ "
                                    "రాక మరియు ఆశీర్వాదాలు ఈ శుభ సందర్భాన్ని మరింత గొప్పగా చేస్తాయి. దయచేసి తప్పకుండా విచ్చేయండి."),
                "about_text": ("వినాయకుడు విఘ్నాలను తొలగించే దేవుడిగా, జ్ఞానం, సౌభాగ్యం మరియు కొత్త ప్రారంభాలను "
                               "ప్రసాదించే దేవుడిగా పూజింపబడతాడు. వినాయక చవితి ఆయన మా ఇళ్లలోకి రాకను సూచిస్తుంది — "
                               "ప్రార్థన, భక్తి, ప్రసాదం మరియు కుటుంబ సమేతంగా జరుపుకునే పండుగ."),
                "meaning_text": ("ఈ ఉత్సవం కేవలం ఒక సంప్రదాయం మాత్రమే కాదు — ఇది వినాయకుని అనుగ్రహానికి మా కుటుంబం "
                                "తెలిపే కృతజ్ఞత. ప్రతి సంవత్సరం మా భక్తిని బలపరుస్తుంది మరియు మా ఆత్మీయులను మరింత దగ్గర చేస్తుంది."),
                "invitation_note": ("వినాయకుడు మీ జీవితంలోని ప్రతి విఘ్నాన్ని తొలగించి, మీ కుటుంబాన్ని జ్ఞానం, "
                                   "సౌభాగ్యం, ఆరోగ్యం మరియు అనంత ఆనందంతో ఆశీర్వదించాలని కోరుకుంటున్నాము."),
            },
        },
        "hi": {
            "devotional": {
                "welcome_message": ("हर वर्ष श्री गणेश हमारे घर को ज्ञान, आनंद और समृद्धि से भर देते हैं। इस वर्ष भी हम "
                                    "अपने गणेश चतुर्थी उत्सव को मनाने के लिए धन्य हैं। आपकी उपस्थिति और आशीर्वाद इस पावन "
                                    "अवसर को और भी विशेष बना देंगे। कृपया अवश्य पधारें।"),
                "about_text": ("भगवान गणेश विघ्नहर्ता तथा ज्ञान, समृद्धि और नए आरंभ के दाता के रूप में पूजे जाते हैं। "
                               "गणेश चतुर्थी उनके हमारे घरों में आगमन का प्रतीक है — प्रार्थना, भक्ति, प्रसाद और परिवार के "
                               "साथ मनाया जाने वाला पर्व।"),
                "meaning_text": ("यह उत्सव केवल एक परंपरा नहीं है — यह भगवान गणेश के प्रति हमारे परिवार की कृतज्ञता की "
                                "अभिव्यक्ति है। हर वर्ष हमारी आस्था को दृढ़ करता है और हमारे प्रियजनों को और करीब लाता है।"),
                "invitation_note": ("भगवान गणेश आपके जीवन के हर विघ्न को दूर करें और आपके परिवार को ज्ञान, समृद्धि, "
                                   "अच्छे स्वास्थ्य और अनंत सुख से आशीर्वादित करें।"),
            },
        },
    },
}


def get_starter(event_type: str, lang: str, option: str) -> Dict[str, str]:
    et = CONTENT.get(event_type) or {}
    by_lang = et.get(lang) or et.get("en") or {}
    return dict(by_lang.get(option) or by_lang.get("devotional") or {})


def build_event_starter_router(db) -> APIRouter:
    router = APIRouter(tags=["event-starter"])

    @router.get("/api/events/starter-content/{event_type}")
    async def _starter(event_type: str, lang: str = "en", option: str = "devotional"):
        if not await registry.module_enabled(db):
            raise HTTPException(404, "Not found")
        return {"event_type": event_type, "lang": lang, "option": option,
                "text": get_starter(event_type, lang, option),
                "note": "Starter text — please review and edit before publishing."}

    return router
