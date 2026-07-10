// Render smoke for the multiplayer chat box (src/ui/hud/ChatBox.jsx): a static
// render seeds its list from the net client's rolling log, labels the local
// player's lines "You" instead of their username, shows other players by their
// roster name, and falls back to the empty state + input prompt when nothing
// has been said. Node-env via react-dom/server, matching the other HUD render
// smokes (effects — the live _onChat wiring — are covered by the match relay
// tests on the server side).
import {describe, expect, it} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ChatBox from "../../../src/ui/hud/ChatBox.jsx";

const netWith = (chat) => ({chat, sendChat() {}, _onChat: null});

describe("ChatBox", () => {
    it("test_renders_messages_from_the_net_clients_log_with_sender_names", () => {
        const html = renderToStaticMarkup(
            React.createElement(ChatBox, {
                mySlot: 3,
                net: netWith([
                    {id: 1, slot: 3, username: "Myself", text: "attack now", ts: 0},
                    {id: 2, slot: 7, username: "Rival", text: "never", ts: 60000},
                ]),
            })
        );
        expect(html).toContain("Comms");
        expect(html).toContain("You");            // own line is labelled You…
        expect(html).not.toContain("Myself");     // …never by the raw username
        expect(html).toContain("Rival");
        expect(html).toContain("attack now");
        expect(html).toContain("never");
    });

    it("test_falls_back_to_the_roster_placeholder_when_a_username_is_missing", () => {
        const html = renderToStaticMarkup(
            React.createElement(ChatBox, {
                mySlot: 0,
                net: netWith([{id: 1, slot: 5, username: "", text: "hello", ts: 0}]),
            })
        );
        expect(html).toContain("Commander");
        expect(html).toContain("hello");
    });

    it("test_shows_the_empty_state_and_the_input_when_nothing_has_been_said", () => {
        const html = renderToStaticMarkup(
            React.createElement(ChatBox, {mySlot: 0, net: netWith([])})
        );
        expect(html).toContain("No transmissions yet.");
        expect(html).toContain("Press Enter to chat");
    });
});
