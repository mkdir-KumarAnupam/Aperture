with open('app/main.py', 'r') as f:
    content = f.read()

import re

old_reddit_format = """        formatted.append({
            "platform": "reddit",
            "postId": pd.get("name") or pd.get("id"),
            "authorId": pd.get("author_fullname") or pd.get("author"),
            "authorHandle": pd.get("author"),
            "title": pd.get("title"),
            "text": pd.get("selftext"),
            "timestamp": datetime.fromtimestamp(pd.get("created_utc", 0)),
            "observedAt": datetime.now().isoformat(),
            "language": "en",  # reddit doesn't strictly provide language field directly
            "detectedLang": lang.get("lang"),
            "languageDetectionConfidence": lang.get("confidence"),
            "hashtags": hashtags, "mentions": mentions, "urls": urls,
            "subreddit": pd.get("subreddit"),
            "subredditSubscribers": pd.get("subreddit_subscribers"),
            "upvoteRatio": pd.get("upvote_ratio"),
            "numComments": pd.get("num_comments"),
            "linkFlairText": pd.get("link_flair_text"),
            "isSelf": pd.get("is_self"),
            "externalUrl": pd.get("url"),
            "permalink": pd.get("permalink"),
            "crosspostParentId": crosspost_id,
            "over18": pd.get("over_18"),
            "spoiler": pd.get("spoiler"),
            "stickied": pd.get("stickied"),
            "isEdited": pd.get("edited", False) != False,
            "editTimestamp": datetime.fromtimestamp(pd.get("edited")) if isinstance(pd.get("edited"), (int, float)) else None,
            "removedByCategory": pd.get("removed_by_category"),
            "engagement": engagement,
            "replyToId": None, "replyToAuthorId": None,
            "forwardFromId": None, "sourceLayer": "keyword_search",
            "retrievalQuery": keyword,
            "discoveredTrend": keyword,
            "contentFingerprint": fingerprint_text(text),
            "relevance": {
                "label": relevance_label,
                "matchedTerms": [keyword] if relevance_label != "irrelevant" else []
            }
        })"""

new_reddit_format = """        from app.processing.schema import make_canonical_event, parse_reddit_date, parse_iso
        for u in urls:
            u["resolutionStatus"] = "resolved" if u.get("resolved") else "unresolved"
        
        post_name = pd.get("name") or ("t3_" + pd.get("id") if pd.get("id") else None)
        author_fullname = pd.get("author_fullname") or pd.get("author")
        # Ensure author_fullname is in canonical t2_ format if available
        if author_fullname and not author_fullname.startswith("t2_") and pd.get("author_fullname"):
            author_fullname = pd.get("author_fullname")

        formatted.append(make_canonical_event(
            event_id=post_name,
            platform="reddit",
            platform_post_id=post_name,
            
            source_layer="keyword_search",
            retrieval_query=keyword,
            discovered_trend=keyword,
            observed_at=datetime.now(datetime.timezone.utc).isoformat(),
            
            text=pd.get("selftext", ""),
            title=pd.get("title", ""),
            language=None,
            detected_lang=lang.get("lang"),
            language_detection_confidence=lang.get("confidence"),
            hashtags=hashtags,
            mentions=mentions,
            urls=urls,
            attachments=None,
            content_fingerprint=fingerprint_text(text),
            
            author_id=author_fullname,
            author_handle=pd.get("author"),
            author_name=None,
            author_bio=None,
            author_location=None,
            
            published_at=parse_reddit_date(pd.get("created_utc", 0)),
            edited_at=parse_reddit_date(pd.get("edited")) if isinstance(pd.get("edited"), (int, float)) else None,
            
            likes=pd.get("ups", 0),
            replies=pd.get("num_comments", 0),
            reposts=None,
            quotes=None,
            bookmarks=None,
            views=None,
            impressions=None,
            
            reply_to_id=crosspost_id, # Can map crosspost to reply_to_id / forward_of_id
            reply_to_author_id=None,
            quote_of_id=None,
            forward_of_id=crosspost_id,
            conversation_id=None,
            
            platform_data={
                "subreddit": pd.get("subreddit"),
                "subredditSubscribers": pd.get("subreddit_subscribers"),
                "upvoteRatio": pd.get("upvote_ratio"),
                "linkFlairText": pd.get("link_flair_text"),
                "isSelf": pd.get("is_self"),
                "externalUrl": pd.get("url"),
                "permalink": pd.get("permalink"),
                "over18": pd.get("over_18"),
                "spoiler": pd.get("spoiler"),
                "stickied": pd.get("stickied"),
                "removedByCategory": pd.get("removed_by_category"),
                "downvotes": pd.get("downs", 0),
                "score": pd.get("score", 0)
            },
            
            match_type=relevance_label,
            matched_terms=[keyword] if relevance_label != "irrelevant" else []
        ))"""
content = content.replace(old_reddit_format, new_reddit_format)

old_ref = """                    referenced_posts.append({
                        "platform": "reddit",
                        "postId": cpd.get("id"),
                        "authorId": cpd.get("author_fullname") or cpd.get("author"),
                        "authorHandle": cpd.get("author"),
                        "text": (cpd.get("title", "") + " " + cpd.get("selftext", "")).strip(),
                        "timestamp": datetime.fromtimestamp(cpd.get("created_utc", 0)),
                        "observedAt": datetime.now().isoformat(),
                        "subreddit": cpd.get("subreddit"),
                        "engagement": {"score": cpd.get("score", 0)},
                        "sourceLayer": "relationship_resolution",
                    })"""

new_ref = """                    cp_text = (cpd.get("title", "") + " " + cpd.get("selftext", "")).strip()
                    cp_post_name = cpd.get("name") or ("t3_" + cpd.get("id") if cpd.get("id") else None)
                    cp_author_fullname = cpd.get("author_fullname") or cpd.get("author")
                    referenced_posts.append(make_canonical_event(
                        event_id=cp_post_name,
                        platform="reddit",
                        platform_post_id=cp_post_name,
                        
                        source_layer="relationship_resolution",
                        retrieval_query=keyword,
                        discovered_trend=keyword,
                        observed_at=datetime.now(datetime.timezone.utc).isoformat(),
                        
                        text=cpd.get("selftext", ""),
                        title=cpd.get("title", ""),
                        language=None,
                        detected_lang=None,
                        language_detection_confidence=None,
                        hashtags=[],
                        mentions=[],
                        urls=[],
                        attachments=None,
                        content_fingerprint=fingerprint_text(cp_text),
                        
                        author_id=cp_author_fullname,
                        author_handle=cpd.get("author"),
                        author_name=None,
                        author_bio=None,
                        author_location=None,
                        
                        published_at=parse_reddit_date(cpd.get("created_utc", 0)),
                        edited_at=parse_reddit_date(cpd.get("edited")) if isinstance(cpd.get("edited"), (int, float)) else None,
                        
                        likes=cpd.get("ups", 0),
                        replies=cpd.get("num_comments", 0),
                        reposts=None,
                        quotes=None,
                        bookmarks=None,
                        views=None,
                        impressions=None,
                        
                        reply_to_id=None,
                        reply_to_author_id=None,
                        quote_of_id=None,
                        forward_of_id=None,
                        conversation_id=None,
                        
                        platform_data={"score": cpd.get("score", 0), "subreddit": cpd.get("subreddit")},
                        match_type="relationship",
                        matched_terms=[]
                    ))"""
content = content.replace(old_ref, new_ref)

with open('app/main.py', 'w') as f:
    f.write(content)
print("patched main.py")
