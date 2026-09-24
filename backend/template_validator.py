"""
PHASE 36: Template Marketplace - Security & Quality Validation

This module validates templates for:
1. Security (no malicious scripts, safe CSS)
2. Performance (file sizes, structure)
3. Quality (completeness, metadata)
"""

import re
import json
from typing import Dict, Any, List, Tuple
import bleach


# Allowed HTML tags for template content
ALLOWED_TAGS = [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'a', 'ul', 'ol', 'li', 'br', 'hr', 'strong', 'em',
    'section', 'article', 'header', 'footer', 'nav', 'aside',
    'button', 'input', 'label', 'form'
]

# Allowed HTML attributes
ALLOWED_ATTRIBUTES = {
    '*': ['class', 'id', 'data-*', 'aria-*'],
    'a': ['href', 'title', 'target'],
    'img': ['src', 'alt', 'width', 'height', 'loading'],
    'input': ['type', 'name', 'value', 'placeholder'],
    'button': ['type'],
    'form': ['action', 'method']
}

# Dangerous CSS properties to block
DANGEROUS_CSS_PATTERNS = [
    r'expression\s*\(',  # IE CSS expressions
    r'javascript:',      # JavaScript URLs
    r'@import',          # External imports
    r'behavior\s*:',     # IE behaviors
    r'url\s*\(\s*["\']?data:',  # Data URLs (can be used for exploits)
]

# Maximum file sizes
MAX_IMAGE_SIZE_KB = 500  # 500 KB per image
MAX_VIDEO_SIZE_KB = 5000  # 5 MB per video
MAX_TOTAL_ASSETS_KB = 10000  # 10 MB total


class TemplateValidationError(Exception):
    """Custom exception for template validation errors"""


def sanitize_html(html_content: str) -> str:
    """
    Sanitize HTML content to prevent XSS attacks
    
    Args:
        html_content: Raw HTML string
        
    Returns:
        Sanitized HTML string
    """
    if not html_content:
        return ""
    
    # Use bleach to sanitize HTML
    clean_html = bleach.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )
    
    return clean_html


def validate_css(css_content: str) -> Tuple[bool, List[str]]:
    """
    Validate CSS for dangerous patterns
    
    Args:
        css_content: CSS string to validate
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues = []
    
    if not css_content:
        return True, []
    
    # Check for dangerous patterns
    for pattern in DANGEROUS_CSS_PATTERNS:
        if re.search(pattern, css_content, re.IGNORECASE):
            issues.append(f"Dangerous CSS pattern detected: {pattern}")
    
    # Check for external resource loading
    if re.search(r'url\s*\(\s*["\']?https?://', css_content, re.IGNORECASE):
        # Allow only specific trusted domains if needed
        # For now, we'll flag it as a warning
        issues.append("External URL detected in CSS. Ensure it's from a trusted source.")
    
    return len(issues) == 0, issues


def validate_javascript(js_content: str) -> Tuple[bool, List[str]]:
    """
    Validate JavaScript - for now, we BLOCK all custom JS
    
    Args:
        js_content: JavaScript string
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues = []
    
    if js_content and js_content.strip():
        issues.append("Custom JavaScript is not allowed in templates for security reasons")
        return False, issues
    
    return True, []


def validate_template_structure(template_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validate template structure and completeness
    
    Args:
        template_data: Complete template configuration
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues = []
    required_fields = ['design_config', 'theme_config']
    
    # Check required fields
    for field in required_fields:
        if field not in template_data or not template_data[field]:
            issues.append(f"Missing required field: {field}")
    
    # Validate design_config structure
    design_config = template_data.get('design_config', {})
    if design_config:
        if 'layout_type' not in design_config:
            issues.append("design_config must include 'layout_type'")
        
        # Check for HTML content and sanitize
        if 'custom_html' in design_config:
            try:
                sanitized = sanitize_html(design_config['custom_html'])
                design_config['custom_html'] = sanitized
            except Exception as e:
                issues.append(f"Failed to sanitize HTML: {str(e)}")
        
        # Check for CSS content and validate
        if 'custom_css' in design_config:
            is_valid, css_issues = validate_css(design_config['custom_css'])
            if not is_valid:
                issues.extend(css_issues)
        
        # Block any JavaScript
        if 'custom_js' in design_config:
            is_valid, js_issues = validate_javascript(design_config['custom_js'])
            if not is_valid:
                issues.extend(js_issues)
    
    # Validate theme_config
    theme_config = template_data.get('theme_config', {})
    if theme_config:
        if 'colors' not in theme_config:
            issues.append("theme_config must include 'colors'")
    
    return len(issues) == 0, issues


def estimate_template_size(template_data: Dict[str, Any]) -> int:
    """
    Estimate total template size in KB
    
    Args:
        template_data: Template configuration
        
    Returns:
        Estimated size in KB
    """
    # Convert template to JSON and measure
    json_str = json.dumps(template_data)
    size_kb = len(json_str.encode('utf-8')) / 1024
    
    # Add estimates for referenced assets
    preview_images = template_data.get('preview_images', [])
    size_kb += len(preview_images) * 100  # Estimate 100 KB per preview image
    
    return int(size_kb)


def validate_asset_urls(urls: List[str]) -> Tuple[bool, List[str]]:
    """
    Validate asset URLs are safe and accessible
    
    Args:
        urls: List of asset URLs
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues = []
    
    for url in urls:
        if not url:
            continue
        
        # Check for data URLs (can be used for attacks)
        if url.startswith('data:'):
            issues.append(f"Data URLs are not allowed: {url[:50]}...")
        
        # Check for javascript: URLs
        if url.lower().startswith('javascript:'):
            issues.append(f"JavaScript URLs are not allowed: {url[:50]}...")
        
        # Ensure HTTPS for external URLs
        if url.startswith('http://'):
            issues.append(f"HTTP URLs are not allowed, use HTTPS: {url[:50]}...")
    
    return len(issues) == 0, issues


def validate_template(template_data: Dict[str, Any]) -> Tuple[bool, List[str], int]:
    """
    Complete template validation
    
    Args:
        template_data: Full template configuration
        
    Returns:
        Tuple of (is_valid, list_of_issues, quality_score)
    """
    all_issues = []
    quality_score = 100  # Start with perfect score
    
    # 1. Validate structure
    is_valid, structure_issues = validate_template_structure(template_data)
    if not is_valid:
        all_issues.extend(structure_issues)
        quality_score -= len(structure_issues) * 10
    
    # 2. Validate asset URLs
    preview_images = template_data.get('preview_images', [])
    is_valid, url_issues = validate_asset_urls(preview_images)
    if not is_valid:
        all_issues.extend(url_issues)
        quality_score -= len(url_issues) * 5
    
    # 3. Check template size
    size_kb = estimate_template_size(template_data)
    if size_kb > MAX_TOTAL_ASSETS_KB:
        all_issues.append(f"Template size ({size_kb} KB) exceeds maximum ({MAX_TOTAL_ASSETS_KB} KB)")
        quality_score -= 20
    
    # 4. Check completeness
    if not template_data.get('name'):
        all_issues.append("Template name is required")
        quality_score -= 10
    
    if not template_data.get('category'):
        all_issues.append("Template category is required")
        quality_score -= 10
    
    if not preview_images:
        all_issues.append("At least one preview image is required")
        quality_score -= 15
    
    # Ensure score doesn't go below 0
    quality_score = max(0, quality_score)
    
    # Template is valid if score >= 60 and no critical issues
    is_valid = quality_score >= 60 and len(all_issues) == 0
    
    return is_valid, all_issues, quality_score


def sanitize_template_for_storage(template_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize template data before storing in database
    
    Args:
        template_data: Raw template data
        
    Returns:
        Sanitized template data
    """
    sanitized = template_data.copy()
    
    # Sanitize design_config
    if 'design_config' in sanitized:
        design_config = sanitized['design_config']
        
        # Sanitize HTML
        if 'custom_html' in design_config:
            design_config['custom_html'] = sanitize_html(design_config['custom_html'])
        
        # Remove any JavaScript
        if 'custom_js' in design_config:
            del design_config['custom_js']
        
        # Clean CSS (basic cleaning)
        if 'custom_css' in design_config:
            css = design_config['custom_css']
            # Remove dangerous patterns
            for pattern in DANGEROUS_CSS_PATTERNS:
                css = re.sub(pattern, '', css, flags=re.IGNORECASE)
            design_config['custom_css'] = css
    
    return sanitized


def calculate_performance_score(template_data: Dict[str, Any]) -> int:
    """
    Calculate a performance score for the template (0-100)
    Based on: size, complexity, asset count
    
    Args:
        template_data: Template configuration
        
    Returns:
        Performance score (0-100)
    """
    score = 100
    
    # Penalize large templates
    size_kb = estimate_template_size(template_data)
    if size_kb > 5000:  # > 5 MB
        score -= 30
    elif size_kb > 2000:  # > 2 MB
        score -= 15
    elif size_kb > 1000:  # > 1 MB
        score -= 5
    
    # Penalize too many preview images
    preview_count = len(template_data.get('preview_images', []))
    if preview_count > 10:
        score -= 20
    elif preview_count > 5:
        score -= 10
    
    # Check for complex CSS
    css = template_data.get('design_config', {}).get('custom_css', '')
    if len(css) > 10000:  # > 10 KB of CSS
        score -= 15
    
    return max(0, score)
