import { StyleSheet, View } from "react-native";
import SearchModeToggle from "../components/SearchModeToggle";
import { Colors } from "../constants/Colors";
import TopNav from "../components/TopNav";
import { useSearchState } from "../context/SearchStateContext";
import UsersSearch from "../components/Search/UsersSearch";
import CommunitiesSearch from "../components/Search/CommunitySearch";

export default function SearchScreen() {
  const { searchMode, setSearchMode } = useSearchState();

  return (
    <View style={styles.container}>
      <TopNav />

      <View style={styles.content}>
        <SearchModeToggle value={searchMode} onChange={setSearchMode} />
      </View>

      {searchMode === "users" ? <UsersSearch /> : <CommunitiesSearch />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  content: {
    paddingHorizontal: 20,
  },
});
