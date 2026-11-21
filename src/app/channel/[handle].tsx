import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useApiClient } from "../../api/useApiClient";
import { getChannel, getChannelVideos, type Channel } from "../../api/channels";
import { getChannelLiveStatus, type LiveStream } from "../../api/live";
import { useCursorPage, type Page } from "../../api/pagination";
import { getVideo, type Video } from "../../api/videos";
import { SubscribeControl } from "../../engagement/SubscribeControl";
import { useAuth } from "../../store/AuthContext";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { LoadingState } from "../../ui/LoadingState";
import { Screen } from "../../ui/Screen";
import { VideoCard } from "../../ui/VideoCard";
import { VideoList } from "../../ui/VideoList";
import { formatCompactNumber, resolveMediaUrl } from "../../ui/format";
import { useTheme } from "../../theme/ThemeProvider";

type TabId = "home" | "videos" | "shorts" | "playlists" | "about";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "videos", label: "Videos" },
  { id: "shorts", label: "Shorts" },
  { id: "playlists", label: "Playlists" },
  { id: "about", label: "About" },
];

/** How many of the Videos-tab items the Home tab teases before "see all" (switch tabs). */
const HOME_TEASER_COUNT = 5;

/**
 * Channel screen (PLAN.md §17.1's Channel row: "Home / Videos / Shorts /
 * Playlists / About tabs"). Mirrors the interaction pattern of
 * `vendor/you-tube/frontend/src/app/pages/channel/channel-page.ts` —
 * banner, avatar, name/handle/subscriber count, optimistic subscribe
 * toggle, tabs, keyset-paginated video list with skeleton states — but
 * laid out as a single scrolling column (one `VideoList`, no grid) since
 * this is a phone, not the web's multi-column grid.
 *
 * Simplifications relative to the web page, noted rather than silently
 * dropped:
 *  - No channel-customisation "sections" (uploads/playlist/single_video
 *    sections from `PATCH /channels/{id}/sections`). Wiring that needs a
 *    new `src/api/` file for an endpoint this chunk doesn't otherwise
 *    touch — out of scope per the task brief's "keep Home simple" option.
 *    Home instead shows the featured video (if `featured_video_id` is
 *    set) plus a short teaser pulled from the same Videos-tab data.
 *  - Playlists tab: `GET /playlists` (`listMyPlaylists`) is the caller's
 *    *own* playlists only — there is no public "this channel's playlists"
 *    endpoint in `contracts/openapi.yaml`. The web channel page already
 *    lives with this gap by omitting the tab entirely; this screen keeps
 *    the tab (the mobile spec names it explicitly) but shows an honest
 *    "not available yet" empty state rather than calling the wrong
 *    endpoint or inventing one.
 *  - Community posts (the web's `community` tab) aren't in the mobile
 *    spec's tab list (§17.1 names Shorts/Playlists instead), so they're
 *    not built here.
 */
export default function ChannelScreen() {
  const theme = useTheme();
  const router = useRouter();
  const client = useApiClient();
  const { user, isAuthenticated } = useAuth();
  const { handle } = useLocalSearchParams<{ handle: string }>();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [featuredVideo, setFeaturedVideo] = useState<Video | null>(null);
  /** `GET /channels/{id}/live` (M4 chunk 3) — fetched once alongside the channel itself, not polled on this screen; the live watch screen (`/live/[channelId]`) is the one that keeps polling once a viewer actually opens it. */
  const [liveStatus, setLiveStatus] = useState<LiveStream | null>(null);
  /** +1/-1/0 vs. the subscriber count last fetched — kept by `SubscribeControl`'s `onSubscribedChange` so the header count tracks an optimistic toggle without a second `getChannel` round trip. */
  const [subscriberDelta, setSubscriberDelta] = useState(0);

  const loadChannel = useCallback(async () => {
    if (!handle) return;
    setLoadingChannel(true);
    setNotFound(false);
    try {
      const result = await getChannel(client, handle);
      setChannel(result);
      setSubscriberDelta(0);
    } catch {
      setChannel(null);
      setNotFound(true);
    } finally {
      setLoadingChannel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, handle]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  // Featured video for the Home tab — `Channel` only carries the id, not
  // the video itself, same gap the web page's `loadFeaturedVideo` works
  // around with a second request.
  useEffect(() => {
    const videoId = channel?.featured_video_id;
    if (!videoId) {
      setFeaturedVideo(null);
      return;
    }
    let cancelled = false;
    getVideo(client, videoId)
      .then((video) => {
        if (!cancelled) setFeaturedVideo(video);
      })
      .catch(() => {
        if (!cancelled) setFeaturedVideo(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, channel?.featured_video_id]);

  useEffect(() => {
    const id = channel?.id;
    if (!id) {
      setLiveStatus(null);
      return;
    }
    let cancelled = false;
    getChannelLiveStatus(client, id).then(
      (stream) => {
        if (!cancelled) setLiveStatus(stream);
      },
      () => {
        if (!cancelled) setLiveStatus(null);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.request, channel?.id]);

  const fetchVideosPage = useCallback(
    (cursor: string | null): Promise<Page<Video>> =>
      getChannelVideos(client, handle ?? "", { cursor, limit: 24 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.request, handle]
  );

  const {
    items: videos,
    isLoading: videosLoading,
    isLoadingMore,
    error: videosError,
    reload: reloadVideos,
    loadMore,
  } = useCursorPage<Video>(fetchVideosPage);

  useEffect(() => {
    void reloadVideos();
    // Re-run only when the handle (the fetch target) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  // Client-side filter, not a separate endpoint (contracts/openapi.yaml
  // has no shorts-only channel listing — `is_short` lives on `Video`).
  const shorts = useMemo(() => videos.filter((video) => video.is_short === true), [videos]);
  const homeTeaser = useMemo(() => videos.slice(0, HOME_TEASER_COUNT), [videos]);

  const isOwnChannel = !!channel?.id && !!user?.channel_id && user.channel_id === channel.id;

  const onPressVideo = (video: Video) => {
    if (video.id) router.push(`/watch/${video.id}`);
  };

  if (loadingChannel) {
    return <LoadingState />;
  }

  if (notFound || !channel) {
    return (
      <Screen centered>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.md }}>
          This channel could not be found.
        </Text>
      </Screen>
    );
  }

  const bannerUrl = resolveMediaUrl(client.baseUrl, channel.banner_path);
  const avatarUrl = resolveMediaUrl(client.baseUrl, channel.avatar_path);

  const channelHeader = (
    <View style={{ marginBottom: theme.spacing[4] }}>
      <View
        style={[
          styles.banner,
          { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.md },
        ]}
      >
        {bannerUrl ? (
          <Image source={{ uri: bannerUrl }} style={styles.bannerImage} accessibilityIgnoresInvertColors />
        ) : null}
      </View>

      <View style={[styles.identityRow, { marginTop: theme.spacing[4] }]}>
        <Avatar uri={avatarUrl} name={channel.name ?? channel.handle ?? "?"} size={64} />
        <View style={[styles.identityText, { marginLeft: theme.spacing[3] }]}>
          <Text
            style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: "700" }}
            numberOfLines={1}
          >
            {channel.name}
          </Text>
          <Text
            style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing[1] }}
            numberOfLines={1}
          >
            @{channel.handle} · {formatCompactNumber((channel.subscriber_count ?? 0) + subscriberDelta)} subscribers
          </Text>
        </View>
      </View>

      {liveStatus?.status === "live" && channel.id ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/live/[channelId]",
              params: { channelId: channel.id as string, channelName: channel.name ?? "", channelHandle: channel.handle ?? "" },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Live now"
          testID="channel-live-banner"
          style={[
            styles.liveBanner,
            { backgroundColor: theme.colors.accent, borderRadius: theme.radius.md, marginTop: theme.spacing[3] },
          ]}
        >
          <Text style={{ color: theme.colors.accentContrast, fontSize: theme.fontSize.sm, fontWeight: "700" }}>
            🔴 LIVE now · {formatCompactNumber(liveStatus.viewer_count ?? 0)} watching
          </Text>
        </Pressable>
      ) : null}

      {isOwnChannel ? (
        <View style={{ marginTop: theme.spacing[3] }}>
          <Button
            label={liveStatus?.status === "live" ? "Manage your live stream" : "Go live"}
            variant="secondary"
            onPress={() => router.push("/you/live")}
            testID="channel-go-live"
          />
        </View>
      ) : null}

      {!isOwnChannel && channel.id ? (
        <View style={{ marginTop: theme.spacing[3] }}>
          <SubscribeControl
            channelId={channel.id}
            initialIsSubscribed={channel.is_subscribed ?? false}
            isAuthenticated={isAuthenticated}
            onRequireAuth={() => router.push("/setup/login")}
            onSubscribedChange={(next) => {
              const original = channel.is_subscribed ?? false;
              setSubscriberDelta(next === original ? 0 : next ? 1 : -1);
            }}
            testIDPrefix="subscribe"
          />
        </View>
      ) : null}

      {(channel.links ?? []).length > 0 ? (
        <View style={[styles.linksRow, { marginTop: theme.spacing[3] }]}>
          {(channel.links ?? []).map((link) => (
            <Text
              key={link.url}
              onPress={() => Linking.openURL(link.url)}
              accessibilityRole="link"
              style={{
                color: theme.colors.link,
                fontSize: theme.fontSize.sm,
                fontWeight: "600",
                marginRight: theme.spacing[4],
                marginTop: theme.spacing[1],
              }}
            >
              {link.label}
            </Text>
          ))}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: theme.spacing[4] }}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => (
          <View key={tab.id} style={{ marginRight: theme.spacing[2] }}>
            <Chip
              label={tab.label}
              active={activeTab === tab.id}
              onPress={() => setActiveTab(tab.id)}
              testID={`channel-tab-${tab.id}`}
            />
          </View>
        ))}
      </ScrollView>

      {activeTab === "home" && featuredVideo ? (
        <View style={{ marginTop: theme.spacing[4] }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize.sm,
              fontWeight: "600",
              marginBottom: theme.spacing[2],
            }}
          >
            Featured
          </Text>
          <VideoCard video={featuredVideo} baseUrl={client.baseUrl} onPress={onPressVideo} />
        </View>
      ) : null}

      {activeTab === "home" ? (
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.sm,
            fontWeight: "600",
            marginTop: theme.spacing[4],
          }}
        >
          Videos
        </Text>
      ) : null}
    </View>
  );

  if (activeTab === "about") {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[6] }}>
          {channelHeader}
          <Text
            style={{ color: theme.colors.text, fontSize: theme.fontSize.md, lineHeight: theme.fontSize.md * 1.4 }}
          >
            {channel.description || "No description yet."}
          </Text>
        </ScrollView>
      </Screen>
    );
  }

  if (activeTab === "playlists") {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing[6] }}>
          {channelHeader}
          {/* Known contract gap (see file-header doc comment): there is no
              public "this channel's playlists" endpoint, so this is an
              honest empty state rather than a fake call. */}
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.sm }}>
            Playlists aren't available for other channels yet.
          </Text>
        </ScrollView>
      </Screen>
    );
  }

  if (activeTab === "shorts") {
    return (
      <Screen>
        <VideoList
          testID="channel-shorts"
          items={shorts}
          baseUrl={client.baseUrl}
          isLoading={videosLoading}
          isLoadingMore={isLoadingMore}
          error={videosError}
          onLoadMore={loadMore}
          onRefresh={reloadVideos}
          onPressVideo={onPressVideo}
          header={channelHeader}
          emptyLabel="No Shorts yet."
        />
      </Screen>
    );
  }

  if (activeTab === "videos") {
    return (
      <Screen>
        <VideoList
          testID="channel-videos"
          items={videos}
          baseUrl={client.baseUrl}
          isLoading={videosLoading}
          isLoadingMore={isLoadingMore}
          error={videosError}
          onLoadMore={loadMore}
          onRefresh={reloadVideos}
          onPressVideo={onPressVideo}
          header={channelHeader}
          emptyLabel="This channel has no public videos yet."
        />
      </Screen>
    );
  }

  // Home: a short, non-paginated teaser — "see all" is just switching to
  // the Videos tab, so `onLoadMore` is a no-op here deliberately.
  return (
    <Screen>
      <VideoList
        testID="channel-home"
        items={homeTeaser}
        baseUrl={client.baseUrl}
        isLoading={videosLoading}
        isLoadingMore={false}
        error={videosError}
        onLoadMore={() => {}}
        onRefresh={reloadVideos}
        onPressVideo={onPressVideo}
        header={channelHeader}
        emptyLabel="This channel has no public videos yet."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    aspectRatio: 3,
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  linksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tabRow: {
    flexDirection: "row",
  },
  liveBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
});
