import re

with open('app/clients/x.py', 'r') as f:
    content = f.read()

new_content = content.replace(
"""            formatted.append({
                "platform": "x", "postId": str(tweet.id),
                "authorId": str(tweet.user.id), "authorHandle": tweet.user.screen_name,
                "authorLocation": getattr(tweet.user, "location", None), "text": text,
                "timestamp": tweet.created_at, "observedAt": datetime.now().isoformat(),
                "language": getattr(tweet, "lang", None), "detectedLang": lang.get("lang"),
                "languageDetectionConfidence": lang.get("confidence"),
                "hashtags": hashtags, "mentions": mentions, "urls": urls,
                "engagement": {
                    "likes": int(getattr(tweet, "favorite_count", 0) or 0),
                    "retweets": int(getattr(tweet, "retweet_count", 0) or 0),
                    "replies": int(getattr(tweet, "reply_count", 0) or 0),
                    "quotes": int(getattr(tweet, "quote_count", 0) or 0),
                },
                "replyCount": int(getattr(tweet, "reply_count", 0) or 0),
                "quoteCount": int(getattr(tweet, "quote_count", 0) or 0),
                "bookmarkCount": int(getattr(tweet, "bookmark_count", 0) or 0),
                "impressionCount": int(getattr(tweet, "view_count", 0) or 0),
                "conversationId": conv_id,
                "possiblySensitive": getattr(tweet, "possibly_sensitive", False),
                "attachments": json.dumps(attachments) if attachments else None,
                "replyToId": reply_to_id, "replyToAuthorId": reply_to_author_id,
                "forwardFromId": forward_from_id, "quoteTweetId": quote_tweet_id,
                "sourceLayer": "keyword_search",
                "retrievalQuery": keyword,
                "discoveredTrend": keyword,
                "contentFingerprint": fingerprint_text(text),
                "isEdited": is_edited
            })""",
"""            from app.processing.schema import make_canonical_event, parse_twitter_date
            
            # Reconstruct urls structure to canonical
            for u in urls:
                if "resolutionStatus" not in u:
                    u["resolutionStatus"] = "resolved" if u.get("resolved") else "unresolved"
            
            # Determine MatchType
            text_lower = text.lower()
            keyword_lower = keyword.lower()
            if keyword_lower in text_lower:
                relevance_label = "lexical"
            elif any(kw in text_lower for kw in keyword_lower.split()):
                relevance_label = "partial_lexical"
            else:
                relevance_label = "unknown"
            
            formatted.append(make_canonical_event(
                event_id=f"x:{tweet.id}",
                platform="x",
                platform_post_id=str(tweet.id),
                
                source_layer="keyword_search",
                retrieval_query=keyword,
                discovered_trend=keyword,
                observed_at=datetime.now(datetime.timezone.utc).isoformat(),
                
                text=text,
                title=None,
                language=getattr(tweet, "lang", None),
                detected_lang=lang.get("lang"),
                language_detection_confidence=lang.get("confidence"),
                hashtags=hashtags,
                mentions=mentions,
                urls=urls,
                attachments=attachments if attachments else None,
                content_fingerprint=fingerprint_text(text),
                
                author_id=str(tweet.user.id),
                author_handle=tweet.user.screen_name,
                author_name=getattr(tweet.user, "name", None),
                author_bio=getattr(tweet.user, "description", None),
                author_location=getattr(tweet.user, "location", None),
                
                published_at=parse_twitter_date(tweet.created_at),
                edited_at=None, # X API doesn't expose precise edit timestamp via twikit currently
                
                likes=int(getattr(tweet, "favorite_count", 0) or 0),
                replies=int(getattr(tweet, "reply_count", 0) or 0),
                reposts=int(getattr(tweet, "retweet_count", 0) or 0),
                quotes=int(getattr(tweet, "quote_count", 0) or 0),
                bookmarks=int(getattr(tweet, "bookmark_count", 0) or 0),
                views=int(getattr(tweet, "view_count", 0) or 0),
                impressions=int(getattr(tweet, "view_count", 0) or 0),
                
                reply_to_id=f"x:{reply_to_id}" if reply_to_id else None,
                reply_to_author_id=str(reply_to_author_id) if reply_to_author_id else None,
                quote_of_id=f"x:{quote_tweet_id}" if quote_tweet_id else None,
                forward_of_id=f"x:{forward_from_id}" if forward_from_id else None,
                conversation_id=f"x:{conv_id}" if conv_id else None,
                
                platform_data={
                    "possiblySensitive": getattr(tweet, "possibly_sensitive", False),
                    "isEdited": is_edited,
                    "authorFollowers": getattr(tweet.user, "followers_count", None),
                    "authorVerified": getattr(tweet.user, "verified", None)
                },
                
                match_type=relevance_label,
                matched_terms=[keyword] if relevance_label != "unknown" else []
            ))"""
)

new_content = new_content.replace(
"""                    referenced_posts.append({
                        "platform": "x", "postId": str(ref_t.id),
                        "authorId": str(ref_t.user.id), "authorHandle": ref_t.user.screen_name,
                        "text": r_text, "timestamp": ref_t.created_at, "observedAt": datetime.now().isoformat(),
                        "language": getattr(ref_t, "lang", None),
                        "engagement": {
                            "likes": getattr(ref_t, "favorite_count", 0) or 0,
                            "retweets": getattr(ref_t, "retweet_count", 0) or 0,
                            "replies": getattr(ref_t, "reply_count", 0) or 0,
                        },
                        "replyToId": r_legacy.get("in_reply_to_status_id_str"),
                        "sourceLayer": "relationship_resolution"
                    })""",
"""                    from app.processing.schema import make_canonical_event, parse_twitter_date
                    r_hashtags = extract_hashtags(r_text)
                    r_mentions = extract_mentions(r_text)
                    r_urls = extract_urls(r_text)
                    r_lang = detect_language(r_text)
                    for u in r_urls:
                        u["resolutionStatus"] = "unresolved"
                    r_reply_to_id = r_legacy.get("in_reply_to_status_id_str")
                    referenced_posts.append(make_canonical_event(
                        event_id=f"x:{ref_t.id}",
                        platform="x",
                        platform_post_id=str(ref_t.id),
                        
                        source_layer="relationship_resolution",
                        retrieval_query=keyword,
                        discovered_trend=keyword,
                        observed_at=datetime.now(datetime.timezone.utc).isoformat(),
                        
                        text=r_text,
                        title=None,
                        language=getattr(ref_t, "lang", None),
                        detected_lang=r_lang.get("lang"),
                        language_detection_confidence=r_lang.get("confidence"),
                        hashtags=r_hashtags,
                        mentions=r_mentions,
                        urls=r_urls,
                        attachments=None,
                        content_fingerprint=fingerprint_text(r_text),
                        
                        author_id=str(ref_t.user.id),
                        author_handle=ref_t.user.screen_name,
                        author_name=getattr(ref_t.user, "name", None),
                        author_bio=getattr(ref_t.user, "description", None),
                        author_location=getattr(ref_t.user, "location", None),
                        
                        published_at=parse_twitter_date(ref_t.created_at),
                        edited_at=None,
                        
                        likes=int(getattr(ref_t, "favorite_count", 0) or 0),
                        replies=int(getattr(ref_t, "reply_count", 0) or 0),
                        reposts=int(getattr(ref_t, "retweet_count", 0) or 0),
                        quotes=int(getattr(ref_t, "quote_count", 0) or 0),
                        bookmarks=int(getattr(ref_t, "bookmark_count", 0) or 0),
                        views=int(getattr(ref_t, "view_count", 0) or 0),
                        impressions=int(getattr(ref_t, "view_count", 0) or 0),
                        
                        reply_to_id=f"x:{r_reply_to_id}" if r_reply_to_id else None,
                        reply_to_author_id=None,
                        quote_of_id=None,
                        forward_of_id=None,
                        conversation_id=None,
                        
                        platform_data={},
                        match_type="relationship",
                        matched_terms=[]
                    ))"""
)

with open('app/clients/x.py', 'w') as f:
    f.write(new_content)
print("patched x.py")
