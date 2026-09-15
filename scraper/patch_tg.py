with open('app/clients/telegram.py', 'r') as f:
    content = f.read()

new_content = content.replace(
"""                formatted.append({
                    "platform": "telegram",
                    "postId": global_post_id,
                    "platformPostId": str(msg.id),
                    
                    "authorId": None,
                    "authorHandle": None, 
                    "authorName": post_author,
                    "authorBio": None,
                    "authorLocation": None,
                    
                    "channelId": str(channel_id) if channel_id else None,
                    "channelUsername": channel_username,
                    "channelTitle": channel_title,
                    
                    "text": text,
                    "timestamp": msg.date.isoformat() if msg.date else None,
                    "observedAt": datetime.now().isoformat(),
                    "language": None,
                    "detectedLang": None,
                    "hashtags": hashtags,
                    "urls": urls,
                    "mentions": [],
                    "engagement": {
                        "views": views,
                        "forwards": forwards,
                        "reactions": reactions_count,
                        "replies": replies_count
                    },
                    "replyToId": reply_to_id,
                    "forwardFromId": forward_from_id,
                    "attachments": attachments if attachments else None,
                    "retrievalQuery": keyword,
                    "discoveredTrend": keyword,
                    "sourceLayer": "telegram_channels_search_posts",
                    "contentFingerprint": fingerprint_text(text)
                })""",
"""                from app.processing.schema import make_canonical_event, parse_iso
                
                # Determine MatchType
                text_lower = text.lower()
                keyword_lower = keyword.lower()
                if keyword_lower in text_lower:
                    relevance_label = "lexical"
                elif any(kw in text_lower for kw in keyword_lower.split()):
                    relevance_label = "partial_lexical"
                else:
                    relevance_label = "unknown"
                    
                pub_date = parse_iso(msg.date.isoformat()) if msg.date else None
                edit_date = parse_iso(msg.edit_date.isoformat()) if getattr(msg, 'edit_date', None) else None
                
                formatted.append(make_canonical_event(
                    event_id=global_post_id,
                    platform="telegram",
                    platform_post_id=str(msg.id),
                    
                    source_layer="telegram_channels_search_posts",
                    retrieval_query=keyword,
                    discovered_trend=keyword,
                    observed_at=datetime.now(datetime.timezone.utc).isoformat(),
                    
                    text=text,
                    title=None,
                    language=None,
                    detected_lang=None,
                    language_detection_confidence=None,
                    hashtags=hashtags,
                    mentions=[],
                    urls=urls,
                    attachments=attachments if attachments else None,
                    content_fingerprint=fingerprint_text(text),
                    
                    author_id=None,
                    author_handle=None,
                    author_name=post_author,
                    author_bio=None,
                    author_location=None,
                    
                    published_at=pub_date,
                    edited_at=edit_date,
                    
                    likes=None,
                    replies=replies_count,
                    reposts=None,
                    quotes=None,
                    bookmarks=None,
                    views=views,
                    impressions=None,
                    
                    reply_to_id=f"telegram:{channel_id}:{reply_to_id}" if reply_to_id and channel_id else None,
                    reply_to_author_id=None,
                    quote_of_id=None,
                    forward_of_id=f"telegram:{msg.fwd_from.from_id.channel_id}:{msg.fwd_from.channel_post}" if msg.fwd_from and getattr(msg.fwd_from, 'from_id', None) and getattr(msg.fwd_from.from_id, 'channel_id', None) and getattr(msg.fwd_from, 'channel_post', None) else (str(forward_from_id) if forward_from_id else None),
                    conversation_id=None,
                    
                    platform_data={
                        "channelId": str(channel_id) if channel_id else None,
                        "channelUsername": channel_username,
                        "channelTitle": channel_title,
                        "forwards": forwards,
                        "reactions": reactions_count
                    },
                    
                    match_type=relevance_label,
                    matched_terms=[keyword] if relevance_label != "unknown" else []
                ))"""
)
with open('app/clients/telegram.py', 'w') as f:
    f.write(new_content)
print("patched telegram.py")
