"""
Story Generation Service using Google Gemini API
Generates personalized love stories and event descriptions for wedding invitations
"""
import os
import aiohttp
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class StoryService:
    """Service for generating wedding stories using Gemini API"""
    
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
        self.enabled = bool(self.api_key)
        
        if not self.enabled:
            print("⚠️  GEMINI_API_KEY not found. Story generation will use fallback content.")
    
    async def generate_love_story(
        self,
        bride_name: str,
        groom_name: str,
        story_prompt: Optional[str] = None,
        tone: str = "romantic"
    ) -> str:
        """
        Generate a personalized love story for the couple
        
        Args:
            bride_name: Bride's name
            groom_name: Groom's name
            story_prompt: Optional custom prompt or key points about their story
            tone: Story tone (romantic, humorous, traditional, cinematic)
        
        Returns:
            Generated love story text
        """
        if not self.enabled:
            return self._get_fallback_story(bride_name, groom_name)
        
        # Build the prompt
        if story_prompt:
            prompt = f"""Write a beautiful and {tone} love story (2-3 paragraphs) about {bride_name} and {groom_name}.

Key points to include:
{story_prompt}

The story should be:
- Heartfelt and genuine
- 2-3 paragraphs long
- Suitable for a wedding invitation
- Culturally respectful
- Written in third person

Do not include any titles or headings, just the story text."""
        else:
            prompt = f"""Write a beautiful and {tone} love story (2-3 paragraphs) about {bride_name} and {groom_name}.

The story should describe how they met, fell in love, and decided to spend their lives together.

The story should be:
- Heartfelt and genuine  
- 2-3 paragraphs long
- Suitable for a wedding invitation
- Culturally respectful
- Written in third person

Do not include any titles or headings, just the story text."""
        
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "contents": [{
                        "parts": [{
                            "text": prompt
                        }]
                    }]
                }
                
                async with session.post(
                    f"{self.api_url}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        story = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        return story.strip() if story else self._get_fallback_story(bride_name, groom_name)
                    else:
                        print(f"Gemini API error: {response.status}")
                        return self._get_fallback_story(bride_name, groom_name)
        
        except Exception as e:
            print(f"Story generation error: {e}")
            return self._get_fallback_story(bride_name, groom_name)
    
    async def generate_event_description(
        self,
        event_type: str,
        bride_name: str,
        groom_name: str,
        date: Optional[str] = None,
        venue: Optional[str] = None
    ) -> str:
        """
        Generate event-specific description
        
        Args:
            event_type: Type of event (engagement, haldi, mehendi, marriage, reception)
            bride_name: Bride's name
            groom_name: Groom's name
            date: Event date (optional)
            venue: Event venue (optional)
        
        Returns:
            Generated event description
        """
        if not self.enabled:
            return self._get_fallback_event_description(event_type)
        
        context_parts = []
        if date:
            context_parts.append(f"Date: {date}")
        if venue:
            context_parts.append(f"Venue: {venue}")
        
        context = "\n".join(context_parts) if context_parts else ""
        
        prompt = f"""Write a warm and inviting description (2-3 sentences) for a {event_type} event for {bride_name} and {groom_name}.

{context}

The description should:
- Be 2-3 sentences maximum
- Be culturally appropriate for Indian weddings
- Sound warm and inviting
- Not include emojis
- Be suitable for a formal invitation

Only return the description text, no titles or explanations."""
        
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "contents": [{
                        "parts": [{
                            "text": prompt
                        }]
                    }]
                }
                
                async with session.post(
                    f"{self.api_url}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        description = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        return description.strip() if description else self._get_fallback_event_description(event_type)
                    else:
                        print(f"Gemini API error: {response.status}")
                        return self._get_fallback_event_description(event_type)
        
        except Exception as e:
            print(f"Event description generation error: {e}")
            return self._get_fallback_event_description(event_type)
    
    def _get_fallback_story(self, bride_name: str, groom_name: str) -> str:
        """Fallback love story when API is unavailable"""
        return f"""Love has a beautiful way of bringing two souls together, and for {bride_name} and {groom_name}, their journey has been nothing short of magical. From their first meeting to the moment they realized they were meant to be together, every step has been filled with laughter, understanding, and deep connection.

As they prepare to begin this new chapter of their lives, they invite you to share in their joy and celebrate the love that has brought them here. Their story is a testament to the power of destiny and the beauty of finding your perfect match.

Join them as they embark on this wonderful journey of togetherness, promising to stand by each other through all of life's adventures."""
    
    def _get_fallback_event_description(self, event_type: str) -> str:
        """Fallback event descriptions"""
        descriptions = {
            "engagement": "Join us as we celebrate the beginning of a beautiful journey together. Your presence will make this special moment even more memorable.",
            "haldi": "Come celebrate this auspicious occasion filled with tradition, laughter, and the vibrant colors of turmeric. Your blessings mean the world to us.",
            "mehendi": "Join us for an evening of intricate designs, traditional music, and joyful celebrations as we prepare for the wedding festivities.",
            "marriage": "We cordially invite you to witness and bless our union as we begin our journey of love and togetherness in the sacred presence of family and friends.",
            "reception": "Please join us for an evening of celebration, good food, and wonderful company as we celebrate our new beginning together."
        }
        return descriptions.get(event_type.lower(), "Join us for a beautiful celebration as we come together with family and friends.")


# Singleton instance
story_service = StoryService()
